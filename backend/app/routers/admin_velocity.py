"""Velocity calculation sub-router.

Endpoints
---------
* ``POST /admin/velocity/calculate`` — admin-only trigger that recomputes
  velocity-trend metrics for all active cards. Returns immediately with
  ``status=started``; the actual calculation runs as a background task
  so the request thread isn't pinned to the worker for the duration of
  a multi-minute corpus walk.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

``calculate_velocity_trends`` is async natively, so the body of the
background task can await it directly — no ``asyncio.to_thread``
wrapping is needed here.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends

from app.authz import require_admin
from app.deps import get_current_user, supabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


# Strong refs for fire-and-forget background tasks. Without this,
# asyncio.create_task results can be GC'd before they finish — Python's
# event loop only holds weak refs.
_BACKGROUND_TASKS: set[asyncio.Task] = set()


@router.post("/admin/velocity/calculate")
async def trigger_velocity_calculation(
    current_user: dict = Depends(get_current_user),
):
    """Trigger velocity trend calculation for all active cards. Runs in background."""
    require_admin(current_user)

    from app.velocity_service import calculate_velocity_trends

    async def _run_velocity():
        try:
            result = await calculate_velocity_trends(supabase)
            logger.info("On-demand velocity calculation completed: %s", result)
        except Exception as exc:
            logger.exception("On-demand velocity calculation failed: %s", exc)

    task = asyncio.create_task(_run_velocity())
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    return {
        "status": "started",
        "message": "Velocity calculation is running in the background.",
    }
