"""Admin user-management sub-router.

Endpoints
---------
* ``GET    /admin/users`` — admin-only paginated list with search /
  role / account_type filters.
* ``PATCH  /admin/users/{user_id}`` — admin-only update of role,
  account_type, display_name. Writes a bounded audit log entry (only
  fields in ``_AUDITABLE_USER_FIELDS`` snapshot before/after) and
  evicts the edited user's cached profile so the change applies on
  their next request. Rate-limited to 30/min.
* ``GET    /admin/users/guests`` — admin-only list of accounts with
  ``account_type='guest'`` plus the workstreams they belong to.
* ``POST   /admin/users/{user_id}/account_type`` — admin-only quick
  upgrade/downgrade between ``paid`` and ``guest``.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

Each Supabase call is wrapped in ``asyncio.to_thread`` (via the
``load`` / ``update_row`` closures) because the sync postgrest client
blocks the event loop. ``_AUDITABLE_USER_FIELDS`` is kept module-local
so adding a new field to ``AdminUserUpdate`` doesn't silently widen the
audit log.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.audit_service import log_admin_action as _log_admin_action
from app.authz import require_admin
from app.deps import (
    evict_cached_profile,
    get_current_user,
    limiter,
    supabase,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


# Fields whose before/after values are captured in the audit log on
# admin user updates. Kept local to this module so a new field added to
# AdminUserUpdate doesn't silently start being snapshotted — extending
# this tuple is the explicit opt-in.
_AUDITABLE_USER_FIELDS: tuple[str, ...] = ("role", "account_type", "display_name")


class AccountTypeUpdate(BaseModel):
    account_type: Literal["paid", "guest"]


class AdminUserUpdate(BaseModel):
    role: Optional[Literal["admin", "user", "service_role"]] = None
    account_type: Optional[Literal["paid", "guest"]] = None
    display_name: Optional[str] = Field(default=None, max_length=200)


@router.get("/admin/users")
async def list_admin_users(
    search: Optional[str] = Query(default=None, max_length=120),
    account_type: Optional[Literal["paid", "guest"]] = None,
    role: Optional[str] = Query(default=None, max_length=40),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    """List users for administration."""
    require_admin(current_user)

    def load() -> dict[str, Any]:
        query = supabase.table("users").select(
            "id, email, display_name, role, account_type, department, created_at, updated_at",
            count="exact",
        )
        if search:
            safe_search = search.replace("%", "\\%").replace("_", "\\_")
            query = query.or_(
                f"email.ilike.%{safe_search}%,display_name.ilike.%{safe_search}%"
            )
        if account_type:
            query = query.eq("account_type", account_type)
        if role:
            query = query.eq("role", role)
        result = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return {"items": result.data or [], "total": result.count or 0}

    return await asyncio.to_thread(load)


@router.patch("/admin/users/{user_id}")
@limiter.limit("30/minute")
async def update_admin_user(
    request: Request,
    user_id: str,
    update: AdminUserUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update user role, account type, or display name."""
    require_admin(current_user)

    def update_row() -> tuple[dict[str, Any], dict[str, Any]]:
        data = update.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="No user fields provided")

        # Read the previous row so the audit `before` snapshot is meaningful.
        # We keep the SELECT and the snapshot bounded to _AUDITABLE_USER_FIELDS
        # so adding a new field to AdminUserUpdate later can't silently log
        # None for its prior value. Use limit(1) instead of .single() so a
        # missing row returns a clean 404 (PostgREST .single() raises on
        # zero rows, which would 500 on a concurrent delete).
        select_cols = ", ".join(("id",) + _AUDITABLE_USER_FIELDS)
        previous_resp = (
            supabase.table("users")
            .select(select_cols)
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if not previous_resp.data:
            raise HTTPException(status_code=404, detail="User not found")
        previous_row = previous_resp.data[0]
        before_snapshot = {
            key: previous_row.get(key)
            for key in data
            if key in _AUDITABLE_USER_FIELDS
        }

        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = supabase.table("users").update(data).eq("id", user_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return result.data[0], before_snapshot

    updated, before_snapshot = await asyncio.to_thread(update_row)
    # Evict the edited user's cached profile so role / account_type changes
    # apply on their next request instead of waiting up to 5 minutes.
    evict_cached_profile(user_id)
    after_snapshot = {key: updated.get(key) for key in before_snapshot}
    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.user.update",
        target_type="user",
        target_id=user_id,
        before=before_snapshot,
        after=after_snapshot,
        request=request,
    )
    return updated


@router.get("/admin/users/guests")
async def list_guest_users(current_user: dict = Depends(get_current_user)):
    """List guest accounts and attached workstreams for admin review."""
    require_admin(current_user)

    def load() -> list[dict]:
        guests = (
            supabase.table("users")
            .select("id, email, display_name, account_type, created_at, updated_at")
            .eq("account_type", "guest")
            .order("created_at", desc=True)
            .execute()
        )
        rows = guests.data or []
        user_ids = [row["id"] for row in rows]
        memberships_by_user: dict[str, list[dict]] = {
            user_id: [] for user_id in user_ids
        }
        if user_ids:
            memberships = (
                supabase.table("workstream_members")
                .select("user_id, role, workstream_id, workstreams(name)")
                .in_("user_id", user_ids)
                .execute()
            )
            for membership in memberships.data or []:
                memberships_by_user.setdefault(membership["user_id"], []).append(
                    membership
                )
        for row in rows:
            row["workstreams"] = memberships_by_user.get(row["id"], [])
        return rows

    return await asyncio.to_thread(load)


@router.post("/admin/users/{user_id}/account_type")
async def update_user_account_type(
    user_id: str,
    update: AccountTypeUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Upgrade or downgrade a user between paid and guest."""
    require_admin(current_user)

    def update_row() -> dict:
        result = (
            supabase.table("users")
            .update(
                {
                    "account_type": update.account_type,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return result.data[0]

    return await asyncio.to_thread(update_row)
