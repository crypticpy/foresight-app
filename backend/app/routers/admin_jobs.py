"""Admin jobs sub-router.

Endpoints
---------
* ``GET /admin/jobs/recent`` — admin-only rollup of the most recent
  research tasks, discovery runs, and workstream scans (up to ``limit``
  rows from each table, default 50, hard-capped at 200).

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

This is an operational heartbeat — the admin console polls it for the
"recent activity" panel — so we deliberately keep the SELECT lists
narrow (no payloads, no large JSON blobs) and the row caps tight. The
sync Supabase calls are wrapped in a single ``asyncio.to_thread`` so
the three table reads share one off-loop hop instead of three.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.authz import require_admin
from app.deps import get_current_user, supabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


@router.get("/admin/jobs/recent")
async def list_recent_admin_jobs(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    """Return recent operational jobs across research, discovery, and scans."""
    require_admin(current_user)

    def load() -> dict[str, Any]:
        research = (
            supabase.table("research_tasks")
            .select("id, task_type, status, card_id, workstream_id, created_at, started_at, completed_at, error_message")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        discovery = (
            supabase.table("discovery_runs")
            .select("id, status, triggered_by, started_at, completed_at, cards_created, cards_enriched, error_message, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        scans = (
            supabase.table("workstream_scans")
            .select("id, workstream_id, user_id, status, created_at, started_at, completed_at, error_message")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        return {
            "research_tasks": research,
            "discovery_runs": discovery,
            "workstream_scans": scans,
        }

    return await asyncio.to_thread(load)
