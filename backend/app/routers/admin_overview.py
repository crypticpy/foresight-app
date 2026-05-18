"""Admin overview sub-router.

Endpoints
---------
* ``GET /admin/overview`` — admin-only operational snapshot: user /
  card / workstream counts grouped by status, recent research-task /
  discovery-run / workstream-scan rollups, and the live runtime flag
  values (``ENVIRONMENT``, ``FORESIGHT_ENABLE_SCHEDULER``,
  ``FORESIGHT_EMBED_WORKER``, ``FORESIGHT_DEMO_FREEZE``).

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

The endpoint pulls a bounded sample of each table (500 research tasks,
50 discovery runs, 50 scans) on a single ``asyncio.to_thread`` call —
the admin console shows these counts as a heartbeat, not as audit
truth, so a fixed cap is fine and keeps the worst-case latency
predictable.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends

from app.authz import require_admin
from app.deps import get_current_user, supabase
from app.routers.admin_settings import _parse_env_value

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


@router.get("/admin/overview")
async def get_admin_overview(current_user: dict = Depends(get_current_user)):
    """Return high-level operational metrics for the admin console."""
    require_admin(current_user)

    def load() -> dict[str, Any]:
        users = supabase.table("users").select("id, role, account_type").execute().data or []
        cards = supabase.table("cards").select("id, status, created_at").execute().data or []
        workstreams = (
            supabase.table("workstreams")
            .select("id, owner_type, is_active, auto_scan")
            .execute()
            .data
            or []
        )
        tasks = (
            supabase.table("research_tasks")
            .select("id, status, task_type, created_at")
            .order("created_at", desc=True)
            .limit(500)
            .execute()
            .data
            or []
        )
        discovery_runs = (
            supabase.table("discovery_runs")
            .select("id, status, started_at, created_at")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
        scans = (
            supabase.table("workstream_scans")
            .select("id, status, created_at")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )

        def counts_by(rows: list[dict], key: str) -> dict[str, int]:
            counts: dict[str, int] = {}
            for row in rows:
                value = row.get(key) or "unknown"
                counts[value] = counts.get(value, 0) + 1
            return counts

        one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        new_cards = 0
        for card in cards:
            try:
                if datetime.fromisoformat(card["created_at"].replace("Z", "+00:00")) >= one_week_ago:
                    new_cards += 1
            except Exception:
                continue

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "users": {
                "total": len(users),
                "by_account_type": counts_by(users, "account_type"),
                "by_role": counts_by(users, "role"),
            },
            "cards": {
                "total": len(cards),
                "new_last_7d": new_cards,
                "by_status": counts_by(cards, "status"),
            },
            "workstreams": {
                "total": len(workstreams),
                "active": sum(bool(row.get("is_active")) for row in workstreams),
                "org_owned": sum(row.get("owner_type") == "org" for row in workstreams),
                "auto_scan": sum(bool(row.get("auto_scan")) for row in workstreams),
            },
            "research_tasks": {
                "total_sampled": len(tasks),
                "by_status": counts_by(tasks, "status"),
                "by_type": counts_by(tasks, "task_type"),
            },
            "discovery_runs": {
                "recent_count": len(discovery_runs),
                "by_status": counts_by(discovery_runs, "status"),
            },
            "workstream_scans": {
                "recent_count": len(scans),
                "by_status": counts_by(scans, "status"),
            },
            "runtime": {
                "environment": os.getenv("ENVIRONMENT", "development"),
                "scheduler_enabled": _parse_env_value(
                    os.getenv("FORESIGHT_ENABLE_SCHEDULER"), "boolean", False
                ),
                "embedded_worker": _parse_env_value(
                    os.getenv("FORESIGHT_EMBED_WORKER"), "boolean", True
                ),
                "demo_freeze": _parse_env_value(
                    os.getenv("FORESIGHT_DEMO_FREEZE"), "boolean", False
                ),
            },
        }

    return await asyncio.to_thread(load)
