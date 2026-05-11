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

# Hard caps the service applies regardless of caller. The admin router caps
# the same values before calling in, but CLI / scripts / future callers
# bypass that — so the floor for safety lives here too.
_LIMIT_HARD_CAP = 10000
_CONCURRENCY_HARD_CAP = 10


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


_POSTGREST_PAGE_SIZE = 1000


async def _process_table(
    supabase: Any,
    *,
    table: Literal["cards", "sources"],
    select_cols: str,
    text_builder,
    limit: int,
    concurrency: int,
    offset: int = 0,
    include_null: bool = True,
) -> Dict[str, Any]:
    """Pull `[offset, offset+limit)` rows from one table and re-embed them.

    PostgREST caps a single response at 1000 rows regardless of `.range()`,
    so we internally page in 1000-row slices until we hit `limit` or a
    slice returns short. The outer `limit` is the total rows processed in
    this call — not the size of one query.

    `include_null=True` (default) covers first-time embedding: rows whose
    `embedding` is NULL are included alongside rows being re-embedded.
    `include_null=False` is the model-rotation variant — only refreshes
    rows that already have a vector, leaving NULLs alone.

    Returns counters plus `next_offset` (where the next call should resume)
    and `done` (True when we reached the tail of the corpus, i.e. the last
    internal page returned fewer than `_POSTGREST_PAGE_SIZE` rows).
    """
    counters: Dict[str, Any] = {
        "total": 0,
        "succeeded": 0,
        "skipped": 0,
        "failed": 0,
        "offset": offset,
        "next_offset": offset,
        "done": False,
    }
    sem = asyncio.Semaphore(max(1, concurrency))

    async def _one(row: Dict[str, Any]) -> None:
        async with sem:
            text = text_builder(row)
            embedding = await _embed_one(text)
            if embedding is None:
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

    cursor = offset
    while counters["total"] < limit:
        page_size = min(_POSTGREST_PAGE_SIZE, limit - counters["total"])
        query = supabase.table(table).select(select_cols)
        if not include_null:
            query = query.not_.is_("embedding", "null")
        query = query.order("id").range(cursor, cursor + page_size - 1)
        resp = await asyncio.to_thread(query.execute)
        rows: List[Dict[str, Any]] = resp.data or []
        if not rows:
            counters["done"] = True
            break

        counters["total"] += len(rows)
        counters["next_offset"] = cursor + len(rows)
        await asyncio.gather(*[_one(r) for r in rows])

        # Short page → past the tail. Stop and mark done so callers can
        # reset the cursor on the next click.
        if len(rows) < page_size:
            counters["done"] = True
            break
        cursor += len(rows)

    return counters


async def run_embedding_backfill(
    supabase: Any,
    *,
    target: Literal["cards", "sources", "both"] = "both",
    limit: int = 2000,
    concurrency: int = 3,
    offsets: Optional[Dict[str, int]] = None,
    include_null: bool = True,
) -> Dict[str, Any]:
    """Re-embed up to `limit` rows from `cards` and/or `sources`.

    `offsets` is a per-table starting cursor (e.g. ``{"cards": 2000}``):
    pages are ordered by `id ASC`, so passing the previous run's
    `next_offset` walks the corpus forward instead of re-embedding the
    same prefix. Callers without a cursor (default) start at 0.

    `include_null` (default True) covers the first-time-embedding case
    where the corpus has never been embedded against the current model;
    NULL-embedding rows are included alongside existing vectors. Pass
    False to restrict to model-rotation semantics (only refresh rows
    that already have a vector).

    `limit` and `concurrency` are clamped to internal hard caps so a
    misconfigured CLI invocation can't issue an unbounded query or spawn
    too many concurrent embedding calls.

    Returns a dict with `model`, `elapsed_s`, and per-table counters
    including `next_offset` / `done`.
    """
    limit = max(1, min(int(limit), _LIMIT_HARD_CAP))
    concurrency = max(1, min(int(concurrency), _CONCURRENCY_HARD_CAP))
    offsets = offsets or {}
    cards_offset = max(0, int(offsets.get("cards", 0)))
    sources_offset = max(0, int(offsets.get("sources", 0)))

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
            offset=cards_offset,
            include_null=include_null,
        )

    if target in ("sources", "both"):
        result["sources"] = await _process_table(
            supabase,
            table="sources",
            select_cols="id, title, ai_summary",
            text_builder=_build_source_text,
            limit=limit,
            concurrency=concurrency,
            offset=sources_offset,
            include_null=include_null,
        )

    result["elapsed_s"] = round(time.time() - started, 2)
    logger.info("Embedding backfill complete: %s", result)
    return result
