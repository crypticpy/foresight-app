"""Admin scan trigger sub-router.

Endpoints
---------
* ``POST /admin/scan`` — admin-only trigger that queues update research
  tasks for every active card that hasn't been refreshed in the last 24
  hours (capped at 10 per invocation). Rate-limited to 3 calls / minute
  so a finger slip doesn't flood the worker queue.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.authz import require_admin
from app.deps import _safe_error, get_current_user, limiter, supabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


@router.post("/admin/scan")
@limiter.limit("3/minute")
async def trigger_manual_scan(
    request: Request, current_user: dict = Depends(get_current_user)
):
    """Manually trigger content scan for all active cards.

    This triggers a quick update research task for cards that haven't been
    updated in the last 24 hours. Limited to admin users.
    """
    require_admin(current_user)

    try:
        # Get cards that need updates (not updated in last 24 hours)
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

        cards_result = (
            supabase.table("cards")
            .select("id, name")
            .eq("status", "active")
            .lt("updated_at", cutoff)
            .limit(10)
            .execute()
        )

        if not cards_result.data:
            return {
                "status": "skipped",
                "message": "No cards need updating",
                "cards_queued": 0,
            }

        # Queue update tasks for each card
        tasks_created = 0
        for card in cards_result.data:
            task_record = {
                "user_id": current_user["id"],
                "card_id": card["id"],
                "task_type": "update",
                "status": "queued",
            }
            result = supabase.table("research_tasks").insert(task_record).execute()
            if result.data:
                tasks_created += 1
                logger.info(f"Queued update task for card: {card['name']}")

        return {
            "status": "scan_triggered",
            "message": f"Queued {tasks_created} update tasks",
            "cards_queued": tasks_created,
        }

    except Exception as e:
        logger.error(f"Manual scan failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("manual scan", e),
        ) from e
