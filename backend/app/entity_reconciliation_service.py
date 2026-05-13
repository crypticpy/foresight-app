"""Reconcile freshly-extracted concept tags into canonical entities.

Pattern Detection v2 separates the two halves of the entity pipeline:

1. ``entity_extraction_service`` calls ``gpt-5.4-mini`` once per item, persists
   ``concept_tags`` on the parent row, and writes one ``entity_mentions`` row
   per tag — with ``entity_id`` left **NULL** on purpose. Extraction is the
   expensive stage and must not pay for the global-view work it can't do.
2. This service runs in a second pass over those pending mentions. For each
   distinct ``(canonical_name, entity_type)`` tuple in the pending set it:

       a. embeds the canonical via ``text-embedding-ada-002``
       b. asks ``match_entities(embedding, prompt_version, threshold)`` for the
          top cosine candidates
       c. **gates** every candidate on lower-cased alias-string overlap. Pure
          cosine on ada-002 over-merges near-synonyms ("agentic AI" vs.
          "ambient AI") — the design review flagged this as the main reason a
          naive BERTopic clone would produce garbage. The substring overlap
          (canonical ↔ alias in either direction OR exact alias hit) is the
          conservative gate that keeps merges defensible.
       d. on accept: ensures an alias row exists, fills ``entity_mentions.
          entity_id`` for every pending row carrying that ``(canonical, type)``
          tuple in this prompt_version.
       e. on miss: inserts a new ``entities`` row (case-folded uniqueness
          handled by the DB) plus its initial alias, then fills the mentions.

Scoping every read/write on ``prompt_version`` is what lets us bump the
extraction prompt and keep the v1 detector running on v1 mentions until
backfill catches the new vocabulary up.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Iterable

from openai import AsyncOpenAI

from app.deps import supabase as default_supabase
from app.openai_provider import (
    get_embedding_deployment,
    openai_async_client as default_openai_client,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Knobs
# ---------------------------------------------------------------------------

# Cosine threshold for ``match_entities``. The function defaults to 0.85; we
# pass it through explicitly so this module is the single source of truth.
# Going below 0.82 starts merging plausible-but-distinct concepts in pilot
# runs; staying above 0.88 fragments the same concept into duplicates.
COSINE_THRESHOLD = 0.85

# Candidate cap per probe. With alias-overlap gating downstream, 5 is enough
# to cover the typical 2-3 near-cosine neighbors plus headroom.
CANDIDATE_LIMIT = 5

# How many *distinct* (canonical, type) tuples to reconcile per call. Each
# tuple costs one embedding (~$0.000004) plus one RPC + one UPDATE. 200 is
# the largest batch that fits comfortably under 30s wall-clock on a cold cache.
DEFAULT_BATCH_SIZE = 200

# Concurrency for the per-tuple work. The embedding call is the only network
# round-trip per tuple; Supabase writes inside ``asyncio.to_thread`` already
# run on a worker pool. Eight in flight is enough to saturate the embedding
# API rate limit without overwhelming Supabase.
DEFAULT_CONCURRENCY = 8


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _PendingTuple:
    """One distinct ``(canonical_name, entity_type)`` to reconcile.

    ``mention_ids`` carries every pending ``entity_mentions.id`` that shares
    this tuple so a single UPDATE clears the whole batch.
    """

    canonical_name: str
    entity_type: str
    mention_ids: tuple[str, ...]


@dataclass
class ReconcileSummary:
    """Outcome of one ``reconcile_pending`` call."""

    prompt_version: str
    pending_tuples: int = 0
    merged_existing: int = 0
    created_new: int = 0
    skipped: int = 0
    mentions_updated: int = 0
    errors: list[str] = field(default_factory=list)

    def as_log(self) -> dict[str, Any]:
        return {
            "prompt_version": self.prompt_version,
            "pending_tuples": self.pending_tuples,
            "merged_existing": self.merged_existing,
            "created_new": self.created_new,
            "skipped": self.skipped,
            "mentions_updated": self.mentions_updated,
            "errors": len(self.errors),
        }


# ---------------------------------------------------------------------------
# Pending-set query
# ---------------------------------------------------------------------------


async def _fetch_pending(
    prompt_version: str, *, supabase: Any, limit: int
) -> list[_PendingTuple]:
    """Pull pending mentions and collapse them by ``(canonical, type)``.

    We over-fetch raw mention rows (``limit * 4``) to give the collapse
    enough material to produce ``limit`` distinct tuples on average, then
    truncate. This keeps batch sizes predictable without a SELECT DISTINCT
    that bypasses the partial pending index.
    """

    def query() -> list[dict[str, Any]]:
        return (
            supabase.table("entity_mentions")
            .select("id, canonical_name, entity_type")
            .eq("prompt_version", prompt_version)
            .is_("entity_id", "null")
            .order("created_at", desc=False)
            .limit(limit * 4)
            .execute()
            .data
            or []
        )

    rows = await asyncio.to_thread(query)

    by_tuple: dict[tuple[str, str], list[str]] = defaultdict(list)
    for row in rows:
        canonical = (row.get("canonical_name") or "").strip()
        entity_type = (row.get("entity_type") or "").strip().lower()
        mention_id = row.get("id")
        if not canonical or not entity_type or not mention_id:
            continue
        # Case-fold on the dict key only — preserve the display form on the
        # eventual ``entities.canonical_name`` write (DB uniqueness is also
        # case-folded so collisions resolve in Postgres).
        key = (canonical.lower(), entity_type)
        by_tuple[key].append(mention_id)

    pending: list[_PendingTuple] = []
    for (_canonical_lower, entity_type), mention_ids in by_tuple.items():
        # Display canonical = the first occurrence's casing.
        display = next(
            (
                r["canonical_name"].strip()
                for r in rows
                if r["id"] == mention_ids[0]
            ),
            _canonical_lower,
        )
        pending.append(
            _PendingTuple(
                canonical_name=display,
                entity_type=entity_type,
                mention_ids=tuple(mention_ids),
            )
        )
        if len(pending) >= limit:
            break

    return pending


# ---------------------------------------------------------------------------
# Embedding + cosine lookup
# ---------------------------------------------------------------------------


async def _embed_canonical(
    canonical: str, *, openai_client: AsyncOpenAI
) -> list[float] | None:
    """Embed one canonical name. Returns ``None`` if the API yields nothing."""

    response = await openai_client.embeddings.create(
        model=get_embedding_deployment(),
        input=canonical,
    )
    if not response.data:
        return None
    embedding = response.data[0].embedding
    if not embedding:
        return None
    return list(embedding)


async def _match_candidates(
    embedding: list[float],
    *,
    prompt_version: str,
    supabase: Any,
) -> list[dict[str, Any]]:
    def call() -> list[dict[str, Any]]:
        response = supabase.rpc(
            "match_entities",
            {
                "query_embedding": embedding,
                "target_prompt_version": prompt_version,
                "match_threshold": COSINE_THRESHOLD,
                "match_limit": CANDIDATE_LIMIT,
            },
        ).execute()
        return response.data or []

    return await asyncio.to_thread(call)


# ---------------------------------------------------------------------------
# Alias-overlap gate
# ---------------------------------------------------------------------------


async def _load_aliases(
    entity_id: str, *, supabase: Any
) -> set[str]:
    def query() -> list[dict[str, Any]]:
        return (
            supabase.table("entity_aliases")
            .select("alias")
            .eq("entity_id", entity_id)
            .execute()
            .data
            or []
        )

    rows = await asyncio.to_thread(query)
    return {(r.get("alias") or "").strip().lower() for r in rows if r.get("alias")}


def _alias_overlap(
    canonical_lower: str,
    candidate_name_lower: str,
    aliases_lower: Iterable[str],
) -> bool:
    """Decide whether ``canonical`` and ``candidate`` are surface-form siblings.

    A merge is allowed if **any** of:

    1. The canonical strings collide directly (lower-cased equality).
    2. The new canonical is a substring of the existing canonical or alias
       (or vice versa). This catches "AI agents" ↔ "AI" pragmatically but
       still blocks "agentic AI" ↔ "ambient AI" because neither contains
       the other.
    3. An exact alias hit (covered by case 2 since the substring check is
       bidirectional, but called out here so future readers know it's
       intentional).

    The check is deliberately conservative — pure cosine on ada-002 is too
    generous, so we keep the overlap gate as the floor.
    """
    if canonical_lower == candidate_name_lower:
        return True
    if canonical_lower in candidate_name_lower or candidate_name_lower in canonical_lower:
        return True
    for alias in aliases_lower:
        if not alias:
            continue
        if canonical_lower == alias:
            return True
        if canonical_lower in alias or alias in canonical_lower:
            return True
    return False


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------


async def _insert_entity(
    canonical: str,
    entity_type: str,
    embedding: list[float],
    prompt_version: str,
    *,
    supabase: Any,
) -> str | None:
    """Insert a new entity row, or fetch the existing one on conflict.

    The unique index ``entities_canonical_type_version_unique`` is the
    arbiter: two concurrent reconcile workers can race here, and only one
    will succeed. The loser re-reads the winning row and proceeds — no
    duplicate entities are created.
    """
    payload = {
        "canonical_name": canonical,
        "entity_type": entity_type,
        "canonical_embedding": embedding,
        "prompt_version": prompt_version,
    }

    def insert() -> str | None:
        try:
            response = supabase.table("entities").insert(payload).execute()
            data = response.data or []
            if data:
                return data[0]["id"]
        except Exception as exc:  # noqa: BLE001 — duplicate-key path below
            logger.debug("entities insert raced or rejected: %s", exc)

        # Conflict path: re-fetch by (lower(canonical), type, version).
        # ``canonical`` comes from LLM-extracted text and may contain `%`
        # or `_`, which Supabase `.ilike()` treats as wildcards and does
        # not escape. Pull the scoped rows for this (type, version) and
        # do the case-insensitive comparison in Python so wildcard
        # characters in the canonical can't mis-link a mention to the
        # wrong entity. The unique index restricts the candidate set to
        # a small number of rows per scope, so over-fetching is cheap.
        target_lower = canonical.lower()
        rows = (
            supabase.table("entities")
            .select("id, canonical_name")
            .eq("entity_type", entity_type)
            .eq("prompt_version", prompt_version)
            .execute()
            .data
            or []
        )
        for row in rows:
            row_name = (row.get("canonical_name") or "").strip().lower()
            if row_name == target_lower:
                return row["id"]
        return None

    return await asyncio.to_thread(insert)


async def _ensure_alias(
    entity_id: str,
    alias: str,
    prompt_version: str,
    *,
    supabase: Any,
) -> None:
    """Idempotent alias insert. The unique index (entity_id, lower(alias))
    swallows duplicates; we just need to attempt the insert."""

    payload = {
        "entity_id": entity_id,
        "alias": alias,
        "prompt_version": prompt_version,
    }

    def insert() -> None:
        try:
            supabase.table("entity_aliases").insert(payload).execute()
        except Exception as exc:  # noqa: BLE001 — duplicate path is silent
            logger.debug("entity_aliases insert (likely duplicate): %s", exc)

    await asyncio.to_thread(insert)


async def _link_mentions(
    entity_id: str,
    mention_ids: Iterable[str],
    *,
    supabase: Any,
) -> int:
    """Fill ``entity_mentions.entity_id`` for a batch and return rows touched."""

    ids = [m for m in mention_ids if m]
    if not ids:
        return 0

    def update() -> int:
        response = (
            supabase.table("entity_mentions")
            .update({"entity_id": entity_id})
            .in_("id", ids)
            .execute()
        )
        return len(response.data or [])

    return await asyncio.to_thread(update)


# ---------------------------------------------------------------------------
# Per-tuple reconciliation
# ---------------------------------------------------------------------------


async def _reconcile_one(
    tup: _PendingTuple,
    prompt_version: str,
    *,
    supabase: Any,
    openai_client: AsyncOpenAI,
    summary: ReconcileSummary,
    summary_lock: asyncio.Lock,
) -> None:
    canonical_lower = tup.canonical_name.lower()

    try:
        embedding = await _embed_canonical(
            tup.canonical_name, openai_client=openai_client
        )
        if embedding is None:
            async with summary_lock:
                summary.skipped += 1
                summary.errors.append(
                    f"empty embedding for {tup.canonical_name!r}"
                )
            return

        candidates = await _match_candidates(
            embedding, prompt_version=prompt_version, supabase=supabase
        )

        chosen_id: str | None = None
        for candidate in candidates:
            if candidate.get("entity_type") != tup.entity_type:
                continue
            cand_name = (candidate.get("canonical_name") or "").strip().lower()
            cand_id = candidate.get("id")
            if not cand_name or not cand_id:
                continue
            aliases = await _load_aliases(cand_id, supabase=supabase)
            if _alias_overlap(canonical_lower, cand_name, aliases):
                chosen_id = cand_id
                break

        if chosen_id:
            await _ensure_alias(
                chosen_id, tup.canonical_name, prompt_version, supabase=supabase
            )
            touched = await _link_mentions(
                chosen_id, tup.mention_ids, supabase=supabase
            )
            async with summary_lock:
                summary.merged_existing += 1
                summary.mentions_updated += touched
            return

        # Miss → create. The unique-index race path is handled inside
        # ``_insert_entity``; the returned id is always the winning row.
        new_id = await _insert_entity(
            tup.canonical_name,
            tup.entity_type,
            embedding,
            prompt_version,
            supabase=supabase,
        )
        if not new_id:
            async with summary_lock:
                summary.skipped += 1
                summary.errors.append(
                    f"could not insert or re-fetch entity for "
                    f"{tup.canonical_name!r}"
                )
            return

        await _ensure_alias(
            new_id, tup.canonical_name, prompt_version, supabase=supabase
        )
        touched = await _link_mentions(new_id, tup.mention_ids, supabase=supabase)
        async with summary_lock:
            summary.created_new += 1
            summary.mentions_updated += touched

    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "reconcile failed for %s (%s)", tup.canonical_name, tup.entity_type
        )
        async with summary_lock:
            summary.skipped += 1
            summary.errors.append(
                f"{tup.canonical_name!r}: {type(exc).__name__}: {exc}"
            )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def reconcile_pending(
    prompt_version: str,
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    concurrency: int = DEFAULT_CONCURRENCY,
    supabase: Any | None = None,
    openai_client: AsyncOpenAI | None = None,
) -> ReconcileSummary:
    """Drain pending mentions for ``prompt_version`` and return a summary.

    Safe to call repeatedly: each call grabs the next batch of pending rows
    (``entity_mentions.entity_id IS NULL``) and either merges them into an
    existing entity or creates a new one. The unique indexes on ``entities``
    and ``entity_mentions`` keep concurrent invocations idempotent.
    """
    sb = supabase if supabase is not None else default_supabase
    oc = openai_client if openai_client is not None else default_openai_client

    summary = ReconcileSummary(prompt_version=prompt_version)
    pending = await _fetch_pending(prompt_version, supabase=sb, limit=batch_size)
    summary.pending_tuples = len(pending)

    if not pending:
        return summary

    sem = asyncio.Semaphore(max(1, concurrency))
    summary_lock = asyncio.Lock()

    async def runner(tup: _PendingTuple) -> None:
        async with sem:
            await _reconcile_one(
                tup,
                prompt_version,
                supabase=sb,
                openai_client=oc,
                summary=summary,
                summary_lock=summary_lock,
            )

    await asyncio.gather(*(runner(t) for t in pending))

    logger.info("reconcile_pending: %s", summary.as_log())
    return summary
