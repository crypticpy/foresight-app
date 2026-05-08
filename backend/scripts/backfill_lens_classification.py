#!/usr/bin/env python3
"""
Lens Classification Backfill

Runs the multi-stage lens cascade (signal_type, secondary_pillars, anchor
scores, CSP goal/measure tagging, issue tags, optional budget/climate dims)
against every active card whose classifier_version is null or stale, and
writes the result back to the cards row.

Mirrors the logic in `routers/admin.py:trigger_lens_backfill` but runs as a
local one-shot with progress visibility instead of fire-and-forget on the
server. Uses the service-role key from `backend/.env`, so no admin JWT is
required.

Usage (run from `backend/`):
    python -m scripts.backfill_lens_classification --dry-run
    python -m scripts.backfill_lens_classification
    python -m scripts.backfill_lens_classification --limit 25 --force

Environment variables (loaded from backend/.env):
    SUPABASE_URL, SUPABASE_SERVICE_KEY  — service-role DB client
    AZURE_OPENAI_*                       — cascade LLM stages
"""

import argparse
import asyncio
import os
import sys
import time
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv


def _add_backend_to_path() -> None:
    """Allow `python -m scripts.foo` from anywhere in the repo."""
    here = os.path.dirname(os.path.abspath(__file__))
    backend = os.path.dirname(here)
    if backend not in sys.path:
        sys.path.insert(0, backend)


_add_backend_to_path()
load_dotenv()


from supabase import create_client  # noqa: E402

from app.lens_classification_service import (  # noqa: E402
    CLASSIFIER_VERSION,
    LensClassificationService,
)
from app.openai_provider import openai_async_client  # noqa: E402


SELECT_COLS = "id, name, summary, pillar_id, horizon, stage_id, classifier_version"


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap on cards to process (default: all matching).",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-classify even if classifier_version already matches the current one.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the candidate count and exit without LLM calls or writes.",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help=(
            "Max cards processed in parallel. The cascade itself has an internal "
            "semaphore of 5; this script's concurrency is the outer fan-out. "
            "Default 5."
        ),
    )
    p.add_argument(
        "--card-ids",
        nargs="*",
        default=None,
        help="Optional explicit list of card UUIDs (overrides version filter).",
    )
    return p.parse_args()


def _build_query(supabase: Any, args: argparse.Namespace):
    q = supabase.table("cards").select(SELECT_COLS).eq("status", "active")
    if args.card_ids:
        q = q.in_("id", args.card_ids)
        if not args.force:
            q = q.or_(
                f'classifier_version.is.null,classifier_version.neq."{CLASSIFIER_VERSION}"'
            )
    elif not args.force:
        q = q.or_(
            f'classifier_version.is.null,classifier_version.neq."{CLASSIFIER_VERSION}"'
        )
    if args.limit:
        q = q.limit(args.limit)
    return q


async def _process_card(
    service: LensClassificationService,
    supabase: Any,
    card: Dict[str, Any],
) -> str:
    """Run the cascade on one card and write the update.

    Returns 'success' / 'partial' / 'failed' for progress accounting.
    """
    try:
        result = await service.classify_card(card)
    except Exception as exc:  # cascade itself raised
        print(f"  [FAIL ] {card['id']}  ({type(exc).__name__}: {exc})")
        return "failed"

    update = result.to_card_update()
    state = "success" if update.get("classifier_version") else "partial"
    if state == "success":
        update["classified_at"] = service.now_iso()

    try:
        await asyncio.to_thread(
            lambda: supabase.table("cards")
            .update(update)
            .eq("id", card["id"])
            .execute()
        )
    except Exception as exc:
        print(f"  [WRITE-FAIL] {card['id']}  ({type(exc).__name__}: {exc})")
        return "failed"

    name = (card.get("name") or "")[:60]
    sig = update.get("signal_type") or "?"
    print(f"  [{state.upper():7}] {card['id']}  signal_type={sig:7}  {name}")
    return state


async def _run(args: argparse.Namespace) -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.", file=sys.stderr)
        return 2

    supabase = create_client(url, key)

    candidates_resp = await asyncio.to_thread(_build_query(supabase, args).execute)
    candidates: List[Dict[str, Any]] = candidates_resp.data or []

    print(f"target classifier_version: {CLASSIFIER_VERSION}")
    print(f"candidates: {len(candidates)}")
    if not candidates:
        print("nothing to do.")
        return 0
    if args.dry_run:
        print("dry run — exiting without LLM calls.")
        for c in candidates[:10]:
            print(f"  would classify  {c['id']}  ({(c.get('name') or '')[:80]})")
        if len(candidates) > 10:
            print(f"  ... and {len(candidates) - 10} more")
        return 0

    service = LensClassificationService(openai_async_client, supabase)
    sem = asyncio.Semaphore(max(1, args.concurrency))
    started = time.time()
    counters = {"success": 0, "partial": 0, "failed": 0}
    counter_lock = asyncio.Lock()

    async def _bounded(card: Dict[str, Any], idx: int) -> None:
        async with sem:
            print(f"[{idx+1:>3}/{len(candidates)}] processing {card['id']}")
            outcome = await _process_card(service, supabase, card)
            async with counter_lock:
                counters[outcome] = counters.get(outcome, 0) + 1

    await asyncio.gather(
        *[_bounded(c, i) for i, c in enumerate(candidates)]
    )

    elapsed = time.time() - started
    print()
    print("done.")
    print(f"  succeeded: {counters['success']}")
    print(f"  partial  : {counters['partial']}  (will be re-tried on next pass)")
    print(f"  failed   : {counters['failed']}")
    print(f"  elapsed  : {elapsed:.1f}s")
    return 0 if counters["failed"] == 0 else 1


def main() -> None:
    args = _parse_args()
    rc = asyncio.run(_run(args))
    sys.exit(rc)


if __name__ == "__main__":
    main()
