"""Lens classification backfill sub-router.

Endpoints
---------
* ``POST /admin/classify/backfill`` — admin-only trigger that re-runs
  the lens classification cascade for cards whose ``classifier_version``
  is null or behind the current ``CLASSIFIER_VERSION``. Selection can
  be narrowed to an explicit ``card_ids`` list. Idempotent: if no
  cards match the version filter, returns ``status=skipped`` without
  enqueuing work.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

The Supabase candidate query and per-card update both block the event
loop on the sync postgrest client, so they're offloaded via
``asyncio.to_thread``. ``user_metadata`` is never overwritten — only
the LLM-derived columns surfaced by ``to_card_update`` are written.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.authz import require_admin
from app.deps import _safe_error, get_current_user, supabase
from app.supabase_in_guard import async_chunked_in_query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


# Strong refs for fire-and-forget background tasks. Without this,
# asyncio.create_task results can be GC'd before they finish — Python's
# event loop only holds weak refs.
_BACKGROUND_TASKS: set[asyncio.Task] = set()


class LensBackfillRequest(BaseModel):
    """Targets for the lens classification cascade.

    - ``card_ids``: explicit list of card UUIDs. Bypasses the version filter.
    - ``limit``:    cap on candidates pulled from the version filter.
                    Hard-capped at 500 to keep a single backfill run bounded.
    - ``force``:    re-classify even when ``classifier_version`` already matches.
    """

    card_ids: Optional[list[str]] = None
    limit: int = 100
    force: bool = False


@router.post("/admin/classify/backfill")
async def trigger_lens_backfill(
    body: LensBackfillRequest,
    current_user: dict = Depends(get_current_user),
):
    """Re-classify cards through the lens cascade. Runs in the background.

    Selection rules:
    - If ``card_ids`` is provided, those exact cards are processed (still
      version-checked unless ``force=True``).
    - Otherwise the endpoint pulls cards whose ``classifier_version`` is
      NULL or does not match the current ``CLASSIFIER_VERSION`` constant.
    - ``user_metadata`` is **never** overwritten by this endpoint — only
      LLM-derived columns are written.

    Idempotent: re-running with no version change is a no-op.
    """
    require_admin(current_user)

    from app.lens_classification_service import (
        CLASSIFIER_VERSION,
        LensClassificationService,
    )

    target_version = CLASSIFIER_VERSION
    capped_limit = max(1, min(body.limit, 500))

    select_cols = "id, name, summary, pillar_id, horizon, stage_id"
    version_filter = f'classifier_version.is.null,classifier_version.neq."{target_version}"'

    def _build_query(card_id_chunk: Optional[list[str]] = None):
        q = supabase.table("cards").select(select_cols).limit(capped_limit)
        if card_id_chunk is not None:
            q = q.in_("id", card_id_chunk)
            if not body.force:
                q = q.or_(version_filter)
        elif not body.force:
            q = q.or_(version_filter)
        return q

    try:
        if body.card_ids:
            # Fan out the explicit-ids path so a large admin list doesn't
            # trip the .in_() URL-length guard. Per-chunk limit is the
            # global cap; we stop early once we've collected enough.
            def _run_chunk(chunk):
                return _build_query(chunk).execute().data or []

            cards = await async_chunked_in_query(_run_chunk, body.card_ids)
            cards = cards[:capped_limit]
        else:
            resp = await asyncio.to_thread(_build_query().execute)
            cards = resp.data or []
    except Exception as exc:
        logger.exception("Lens backfill candidate query failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("lens backfill candidate lookup", exc),
        ) from exc
    if not cards:
        return {
            "status": "skipped",
            "queued": 0,
            "target_version": target_version,
            "message": "No cards matched the version filter.",
        }

    async def _run_backfill():
        from app.openai_provider import openai_async_client

        service = LensClassificationService(openai_async_client, supabase)
        succeeded = 0
        partial = 0
        failed = 0
        for card in cards:
            try:
                result = await service.classify_card(card)
                update = result.to_card_update()
                # Only mark classified_at when the cascade actually
                # stamped a version (i.e. all required stages succeeded).
                # Partial failures keep classifier_version null so the
                # next backfill pass re-tries them.
                if update.get("classifier_version") is not None:
                    update["classified_at"] = service.now_iso()
                    succeeded += 1
                else:
                    partial += 1
                await asyncio.to_thread(
                    lambda c=card, u=update: supabase.table("cards")
                    .update(u)
                    .eq("id", c["id"])
                    .execute()
                )
            except Exception as exc:
                logger.exception(
                    "Lens backfill failed for card %s: %s", card.get("id"), exc
                )
                failed += 1
        logger.info(
            "Lens backfill complete: target=%s succeeded=%d partial=%d failed=%d",
            target_version,
            succeeded,
            partial,
            failed,
        )

    backfill_task = asyncio.create_task(_run_backfill())
    _BACKGROUND_TASKS.add(backfill_task)
    backfill_task.add_done_callback(_BACKGROUND_TASKS.discard)

    return {
        "status": "started",
        "queued": len(cards),
        "target_version": target_version,
        "force": body.force,
    }
