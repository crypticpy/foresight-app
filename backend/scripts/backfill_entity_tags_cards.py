#!/usr/bin/env python3
"""
Pattern Detection v2 — Entity Tag Backfill (cards)

Walks the active card set and runs the two-stage entity pipeline:

1. ``entity_extraction_service.extract_for_item`` — one ``gpt-5.4-mini``
   call per card, writes ``concept_tags`` JSONB on the card and one row per
   tag into ``entity_mentions`` (entity_id NULL).
2. ``entity_reconciliation_service.reconcile_pending`` — drains the pending
   mentions in batches, embeds each unique ``(canonical, type)`` tuple, and
   resolves it to an existing ``entities`` row or creates a new one.

The script mirrors ``backfill_lens_classification.py``: argparse, dotenv,
service-role client, async fan-out under a Semaphore, dry-run mode, optional
``--card-ids`` for targeted re-runs.

Usage (from ``backend/``):
    python -m scripts.backfill_entity_tags_cards --dry-run
    python -m scripts.backfill_entity_tags_cards --limit 50
    python -m scripts.backfill_entity_tags_cards --force --card-ids <uuid> <uuid>
    python -m scripts.backfill_entity_tags_cards --skip-reconcile

Environment (loaded from backend/.env):
    SUPABASE_URL, SUPABASE_SERVICE_KEY  — service-role DB client
    AZURE_OPENAI_*                       — extraction LLM + embedding
"""

import argparse
import asyncio
import os
import sys
import time
from typing import Any, Dict, List

from dotenv import load_dotenv


def _add_backend_to_path() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    backend = os.path.dirname(here)
    if backend not in sys.path:
        sys.path.insert(0, backend)


_add_backend_to_path()
load_dotenv()


from supabase import create_client  # noqa: E402

from app.cost_guardrail import BudgetExceededError, check_budget_or_skip  # noqa: E402
from app.entity_extraction_service import (  # noqa: E402
    EXTRACTION_PROMPT_VERSION,
    ConceptTagExtractionError,
    ConceptTagInput,
    extract_for_item,
)
from app.entity_reconciliation_service import reconcile_pending  # noqa: E402
from app.openai_provider import openai_async_client  # noqa: E402


SELECT_COLS = (
    "id, name, summary, description, pillar_id, created_at, concept_tags_version"
)
# ``check_budget_or_skip`` reads the rolling-window state and raises if the
# guardrail has tripped — no per-call cost arg. Extraction is cheap
# (~$0.0001/card on gpt-5.4-mini in + ~$0.0002 out) but a runaway backfill
# should still respect the global trip wire.


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap on cards to process this run (default: all matching).",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help=(
            "Re-extract even if concept_tags_version already matches the current"
            " EXTRACTION_PROMPT_VERSION."
        ),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print candidate count + first 10 ids and exit without LLM calls.",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Cards processed in parallel during extraction. Default 5.",
    )
    p.add_argument(
        "--card-ids",
        nargs="*",
        default=None,
        help="Optional explicit list of card UUIDs (overrides version filter).",
    )
    p.add_argument(
        "--skip-reconcile",
        action="store_true",
        help=(
            "Run only the extraction half. Useful for staged backfills where you"
            " want to reconcile separately."
        ),
    )
    p.add_argument(
        "--reconcile-only",
        action="store_true",
        help="Skip extraction; just drain pending entity_mentions.",
    )
    p.add_argument(
        "--reconcile-batch-size",
        type=int,
        default=200,
        help="Tuples per reconciliation pass. Default 200.",
    )
    return p.parse_args()


def _build_candidate_query(supabase: Any, args: argparse.Namespace):
    """Match the lens-backfill query shape — active cards, version filter."""
    q = supabase.table("cards").select(SELECT_COLS).eq("status", "active")
    if args.card_ids:
        q = q.in_("id", args.card_ids)
        if not args.force:
            q = q.or_(
                f"concept_tags_version.is.null,"
                f'concept_tags_version.neq."{EXTRACTION_PROMPT_VERSION}"'
            )
    elif not args.force:
        q = q.or_(
            f"concept_tags_version.is.null,"
            f'concept_tags_version.neq."{EXTRACTION_PROMPT_VERSION}"'
        )
    if args.limit:
        q = q.limit(args.limit)
    return q


async def _process_card(
    supabase: Any,
    card: Dict[str, Any],
) -> str:
    """Extract + persist for one card. Returns 'success' / 'empty' / 'failed'."""

    try:
        await check_budget_or_skip()
    except BudgetExceededError as exc:
        print(f"  [BUDGET] {card['id']}  ({exc})")
        return "failed"

    payload = ConceptTagInput(
        item_id=str(card["id"]),
        item_type="card",
        name=(card.get("name") or ""),
        summary=card.get("summary"),
        description=card.get("description"),
        pillar_id=card.get("pillar_id"),
        item_created_at=str(card.get("created_at") or ""),
    )

    try:
        result = await extract_for_item(
            payload, supabase=supabase, openai_client=openai_async_client
        )
    except ConceptTagExtractionError as exc:
        print(f"  [PARSE-FAIL] {card['id']}  ({exc})")
        return "failed"
    except Exception as exc:  # noqa: BLE001
        print(f"  [FAIL ] {card['id']}  ({type(exc).__name__}: {exc})")
        return "failed"

    name = (card.get("name") or "")[:60]
    n_tags = len(result.tags)
    state = "success" if n_tags else "empty"
    print(f"  [{state.upper():7}] {card['id']}  tags={n_tags:>2}  {name}")
    return state


async def _run(args: argparse.Namespace) -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.",
            file=sys.stderr,
        )
        return 2

    supabase = create_client(url, key)

    print(f"target extraction_prompt_version: {EXTRACTION_PROMPT_VERSION}")

    if not args.reconcile_only:
        candidates_resp = await asyncio.to_thread(
            _build_candidate_query(supabase, args).execute
        )
        candidates: List[Dict[str, Any]] = candidates_resp.data or []
        print(f"candidates for extraction: {len(candidates)}")

        if args.dry_run:
            print("dry run — exiting without LLM calls.")
            for c in candidates[:10]:
                print(f"  would tag  {c['id']}  ({(c.get('name') or '')[:80]})")
            if len(candidates) > 10:
                print(f"  ... and {len(candidates) - 10} more")
            return 0

        if candidates:
            sem = asyncio.Semaphore(max(1, args.concurrency))
            counters = {"success": 0, "empty": 0, "failed": 0}
            counter_lock = asyncio.Lock()
            started = time.time()

            async def _bounded(card: Dict[str, Any], idx: int) -> None:
                async with sem:
                    print(
                        f"[{idx+1:>4}/{len(candidates)}] extracting {card['id']}"
                    )
                    outcome = await _process_card(supabase, card)
                    async with counter_lock:
                        counters[outcome] = counters.get(outcome, 0) + 1

            await asyncio.gather(
                *[_bounded(c, i) for i, c in enumerate(candidates)]
            )

            elapsed = time.time() - started
            print()
            print("extraction done.")
            print(f"  succeeded: {counters['success']}")
            print(f"  empty    : {counters['empty']}  (stamped version, no tags)")
            print(f"  failed   : {counters['failed']}")
            print(f"  elapsed  : {elapsed:.1f}s")
            extract_rc = 0 if counters["failed"] == 0 else 1
        else:
            print("  nothing to extract.")
            extract_rc = 0
    else:
        extract_rc = 0

    if args.skip_reconcile:
        return extract_rc

    # ---- Reconciliation pass(es) --------------------------------------------
    print()
    print(f"reconciling pending mentions for {EXTRACTION_PROMPT_VERSION}...")
    total = {
        "tuples": 0,
        "merged": 0,
        "created": 0,
        "skipped": 0,
        "mentions": 0,
        "passes": 0,
    }
    while True:
        # Reconciliation embeds every distinct (canonical, type) tuple, so
        # it has its own per-call spend ($\\approx$ $0.000004/embedding).
        # Honor the global trip-wire here too — without this, a tripped
        # budget during extraction wouldn't stop the reconciliation loop
        # from continuing to incur embedding spend.
        try:
            await check_budget_or_skip()
        except BudgetExceededError as exc:
            print(f"  [BUDGET] reconciliation paused ({exc})")
            break

        summary = await reconcile_pending(
            EXTRACTION_PROMPT_VERSION,
            batch_size=args.reconcile_batch_size,
            supabase=supabase,
            openai_client=openai_async_client,
        )
        total["passes"] += 1
        total["tuples"] += summary.pending_tuples
        total["merged"] += summary.merged_existing
        total["created"] += summary.created_new
        total["skipped"] += summary.skipped
        total["mentions"] += summary.mentions_updated
        print(
            f"  pass {total['passes']}: tuples={summary.pending_tuples}  "
            f"merged={summary.merged_existing}  created={summary.created_new}  "
            f"skipped={summary.skipped}  mentions_updated={summary.mentions_updated}"
        )
        if summary.errors:
            for err in summary.errors[:5]:
                print(f"    err: {err}")
            if len(summary.errors) > 5:
                print(f"    ... +{len(summary.errors) - 5} more errors")
        if summary.pending_tuples == 0:
            break
        if (
            summary.merged_existing == 0
            and summary.created_new == 0
            and summary.skipped == summary.pending_tuples
        ):
            print("  reconciliation made no forward progress — stopping.")
            break

    print()
    print("reconciliation done.")
    print(f"  passes        : {total['passes']}")
    print(f"  tuples seen   : {total['tuples']}")
    print(f"  merged        : {total['merged']}")
    print(f"  created       : {total['created']}")
    print(f"  skipped       : {total['skipped']}")
    print(f"  mentions wrote: {total['mentions']}")

    rec_rc = 0 if total["skipped"] == 0 else 1
    return extract_rc or rec_rc


def main() -> None:
    args = _parse_args()
    rc = asyncio.run(_run(args))
    sys.exit(rc)


if __name__ == "__main__":
    main()
