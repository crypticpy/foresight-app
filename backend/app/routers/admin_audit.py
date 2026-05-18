"""Admin audit-log sub-router.

Endpoints
---------
* ``GET /admin/audit`` — admin-only paginated read over
  ``admin_audit_log`` with optional ``target_type`` / ``actor_id`` /
  ``since`` filters. Rate-limited to 60/min so the admin console can
  poll the audit tab without tripping a broader throttle.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

The audit log is append-only — writes happen in
``app.audit_service.log_admin_action`` from each mutating admin
endpoint (settings, users, etc.). This router only reads, so it
deliberately exposes no write surface.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query, Request

from app.authz import require_admin
from app.deps import get_current_user, limiter, supabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


@router.get("/admin/audit")
@limiter.limit("60/minute")
async def list_admin_audit(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    target_type: Optional[Literal["user", "setting"]] = None,
    actor_id: Optional[str] = None,
    since: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user),
):
    """Paginated admin audit log with optional filters."""
    require_admin(current_user)

    def load() -> dict[str, Any]:
        query = supabase.table("admin_audit_log").select(
            "id, actor_id, actor_email, action, target_type, target_id, "
            "before, after, request_ip, created_at",
            count="exact",
        )
        if target_type:
            query = query.eq("target_type", target_type)
        if actor_id:
            query = query.eq("actor_id", actor_id)
        if since:
            query = query.gte("created_at", since.isoformat())
        result = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return {"items": result.data or [], "total": result.count or 0}

    return await asyncio.to_thread(load)
