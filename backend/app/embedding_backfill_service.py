"""Re-embed `cards` and `sources` rows against the currently-configured embedding model.

Used when the deployed embedding model changes (e.g. ada-002 → 3-small) and
the persisted vectors need to be regenerated so search quality doesn't
collapse. Mirrors the input-text shape that the original write paths use
(`discovery_service._store_source_to_card`, `research_service` card update),
so a re-embed produces vectors comparable to fresh writes.

Caller: `routers/admin.py:trigger_embedding_backfill` (fire-and-forget) and
the matching CLI under `backend/scripts/`.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Literal, Optional

from app.openai_provider import (
    azure_openai_async_embedding_client,
    get_embedding_deployment,
)

logger = logging.getLogger(__name__)

# Per-row input cap. Matches the truncation every other embedding callsite
# uses (`recovery_service._generate_embedding`, `research_service.embed_text`).
_INPUT_CHAR_CAP = 8000


def _build_card_text(card: Dict[str, Any]) -> str:
    """Compose the embedding input for a cards row.

    Mirrors `research_service._update_card_embedding` so the new vector
    lives in the same semantic space as cards written today.
    """
    name = (card.get("name") or "").strip()
    summary = (card.get("summary") or "").strip()
    description = (card.get("description") or "").strip()
    return f"{name} {summary} {description}".strip()


def _build_source_text(source: Dict[str, Any]) -> str:
    """Compose the embedding input for a sources row.

    Sources use `title + ai_summary` (the post-analysis summary stored on
    the row), matching the discovery pipeline's source-embedding shape.
    """
    title = (source.get("title") or "").strip()
    ai_summary = (source.get("ai_summary") or "").strip()
    return f"{title} {ai_summary}".strip()


async def _embed_one(text: str) -> Optional[List[float]]:
    """Call the embedding API for a single row. Returns None on failure
    so the caller can count + continue rather than abort the whole run."""
    if len(text) < 10:
        return None
    try:
        resp = await azure_openai_async_embedding_client.embeddings.create(
            model=get_embedding_deployment(),
            input=text[:_INPUT_CHAR_CAP],
            timeout=60,
        )
        return resp.data[0].embedding
    except Exception as exc:
        logger.warning("Embedding call failed: %s", exc)
        return None


async def _process_table(
    supabase: Any,
    *,
    table: Literal["cards", "sources"],
    select_cols: str,
    text_builder,
    limit: int,
    concurrency: int,
) -> Dict[str, int]:
    """Pull candidates from one table and re-embed them with bounded concurrency."""
    query = (
        supabase.table(table)
        .select(select_cols)
        .not_.is_("embedding", "null")
        .limit(limit)
    )
    resp = await asyncio.to_thread(query.execute)
    rows: List[Dict[str, Any]] = resp.data or []
    counters = {"total": len(rows), "succeeded": 0, "skipped": 0, "failed": 0}
    if not rows:
        return counters

    sem = asyncio.Semaphore(max(1, concurrency))

    async def _one(row: Dict[str, Any]) -> None:
        async with sem:
            text = text_builder(row)
            embedding = await _embed_one(text)
            if embedding is None:
                # Either the input was too short to be meaningful or the
                # embedding API itself errored. Either way: leave the old
                # vector in place rather than nulling out search coverage.
                counters["skipped" if len(text) < 10 else "failed"] += 1
                return
            try:
                await asyncio.to_thread(
                    lambda r=row, e=embedding: supabase.table(table)
                    .update({"embedding": e})
                    .eq("id", r["id"])
                    .execute()
                )
                counters["succeeded"] += 1
            except Exception as exc:
                logger.warning(
                    "Embedding write failed for %s/%s: %s", table, row.get("id"), exc
                )
                counters["failed"] += 1

    await asyncio.gather(*[_one(r) for r in rows])
    return counters


async def run_embedding_backfill(
    supabase: Any,
    *,
    target: Literal["cards", "sources", "both"] = "both",
    limit: int = 2000,
    concurrency: int = 3,
) -> Dict[str, Any]:
    """Re-embed up to `limit` rows from `cards` and/or `sources`.

    Returns a dict with `model`, `elapsed_s`, and per-table counters.

    The corpus is read with a single `.limit(limit)` query per table — for
    a one-shot model swap that's fine; if you need to walk a larger pool
    than the cap, run the endpoint repeatedly (rows with non-null
    embeddings come back in undefined order, so successive runs will
    eventually cover the whole set).
    """
    model = get_embedding_deployment()
    started = time.time()
    result: Dict[str, Any] = {"model": model, "target": target}

    if target in ("cards", "both"):
        result["cards"] = await _process_table(
            supabase,
            table="cards",
            select_cols="id, name, summary, description",
            text_builder=_build_card_text,
            limit=limit,
            concurrency=concurrency,
        )

    if target in ("sources", "both"):
        result["sources"] = await _process_table(
            supabase,
            table="sources",
            select_cols="id, title, ai_summary",
            text_builder=_build_source_text,
            limit=limit,
            concurrency=concurrency,
        )

    result["elapsed_s"] = round(time.time() - started, 2)
    logger.info("Embedding backfill complete: %s", result)
    return result
