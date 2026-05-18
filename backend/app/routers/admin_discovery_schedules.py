"""Admin discovery-schedule CRUD (sub-router).

Endpoints
---------
* ``GET    /admin/discovery/schedules``               — list all schedules.
* ``POST   /admin/discovery/schedules``               — create a schedule.
* ``PATCH  /admin/discovery/schedules/{id}``          — partial update.
* ``DELETE /admin/discovery/schedules/{id}``          — remove a schedule.

This module is a FastAPI sub-router with no prefix; the parent aggregator
(``admin_discovery.py``) mounts it under the ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix at exactly one place
(the aggregator) so the URL surface doesn't drift.

The legacy single-row endpoints (``GET/PUT /api/v1/discovery/schedule``)
stay wired up for back-compat — the worker also still polls the same
table. These admin endpoints are a fully replicated CRUD surface that
lets ops manage multiple schedules without touching SQL. Multi-row
scheduling already works at the worker layer
(``ForesightWorker._run_scheduled_discovery`` claims any enabled row
whose ``next_run_at`` is past), so this router only adds the surface
area, not dispatch rewiring.
"""

from __future__ import annotations

import asyncio
import copy
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.audit_service import log_admin_action
from app.authz import require_admin
from app.deps import _safe_error, get_current_user, supabase
from app.models import AdminScheduleRow, AdminSchedulesListResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin-discovery"])


# ---------------------------------------------------------------------------
# Validation whitelists
# ---------------------------------------------------------------------------

ALLOWED_SCHEDULE_CATEGORIES = (
    "rss",
    "news",
    "academic",
    "government",
    "tech_blog",
    "web_search",
)

ALLOWED_PILLAR_CODES = ("CH", "EW", "HG", "HH", "MC", "PS")


# ---------------------------------------------------------------------------
# Pydantic bodies
# ---------------------------------------------------------------------------


class AdminScheduleBase(BaseModel):
    """Common fields shared by create/update schedule payloads.

    Validates pillar codes and source-category names at the API edge so the
    DB never sees garbage. The pillar/category whitelists are intentionally
    duplicated here rather than imported from the analytics router so the
    admin surface keeps zero coupling to non-admin code.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    enabled: Optional[bool] = None
    interval_hours: Optional[int] = Field(default=None, ge=1, le=168)
    max_search_queries_per_run: Optional[int] = Field(default=None, ge=1, le=200)
    pillars_to_scan: Optional[list[str]] = None
    process_rss_first: Optional[bool] = None
    next_run_at: Optional[datetime] = None
    cron_expression: Optional[str] = Field(default=None, max_length=100)
    timezone: Optional[str] = Field(default=None, max_length=64)
    categories_to_scan: Optional[list[str]] = None
    source_ids: Optional[list[str]] = None
    notes: Optional[str] = Field(default=None, max_length=500)


class AdminScheduleCreate(AdminScheduleBase):
    """Body for ``POST /admin/discovery/schedules``.

    ``name`` is required for create (sub-classes Optional in the base for
    PATCH ergonomics, so we re-tighten here).
    """

    name: str = Field(min_length=1, max_length=120)


class AdminScheduleUpdate(AdminScheduleBase):
    """Body for ``PATCH /admin/discovery/schedules/{id}``.

    All fields optional — only the ones present in the JSON body are
    written. Empty body is rejected at the route so the audit log doesn't
    pick up no-op updates.
    """


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _validate_schedule_lists(
    pillars: Optional[list[str]],
    categories: Optional[list[str]],
) -> None:
    """Reject pillar codes / category names that aren't in the whitelist.

    Pulled out so create + update share validation without re-implementing it.
    """
    if pillars is not None:
        unknown = [p for p in pillars if p not in ALLOWED_PILLAR_CODES]
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown pillar codes: {unknown}. "
                    f"Allowed: {list(ALLOWED_PILLAR_CODES)}"
                ),
            )
    if categories is not None:
        unknown = [c for c in categories if c not in ALLOWED_SCHEDULE_CATEGORIES]
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown source categories: {unknown}. "
                    f"Allowed: {list(ALLOWED_SCHEDULE_CATEGORIES)}"
                ),
            )


def _serialize_schedule(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize a discovery_schedule row for the JSON response.

    Keeps the shape stable even on rows from the v1 schema that don't yet
    have the columns added in 20260509000002.
    """
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "enabled": bool(row.get("enabled")),
        "interval_hours": row.get("interval_hours") or 24,
        "max_search_queries_per_run": row.get("max_search_queries_per_run") or 20,
        "pillars_to_scan": row.get("pillars_to_scan") or [],
        "process_rss_first": bool(row.get("process_rss_first", True)),
        "cron_expression": row.get("cron_expression"),
        "timezone": row.get("timezone"),
        "next_run_at": row.get("next_run_at"),
        "last_run_at": row.get("last_run_at"),
        "last_run_status": row.get("last_run_status"),
        "last_run_summary": row.get("last_run_summary"),
        "categories_to_scan": row.get("categories_to_scan") or [],
        "source_ids": row.get("source_ids") or [],
        "notes": row.get("notes"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _coerce_schedule_payload(body: AdminScheduleBase) -> dict[str, Any]:
    """Convert the Pydantic body into a dict suitable for Supabase.

    ``next_run_at`` is a ``datetime`` on the model so FastAPI parses ISO 8601
    cleanly, but Supabase wants a string. ``source_ids`` arrives as strings
    (UUIDs) and we leave them as-is — Supabase handles the cast on insert.
    """
    payload = body.model_dump(exclude_none=True)
    if "next_run_at" in payload and isinstance(payload["next_run_at"], datetime):
        payload["next_run_at"] = payload["next_run_at"].isoformat()
    return payload


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/admin/discovery/schedules", response_model=AdminSchedulesListResponse
)
async def list_admin_schedules(
    current_user: dict = Depends(get_current_user),
):
    """Return every discovery schedule (enabled + disabled).

    The response is a flat list — admins typically have a handful of
    schedules at most, so we don't bother paginating.
    """
    require_admin(current_user)

    def load() -> dict[str, Any]:
        rows = (
            supabase.table("discovery_schedule")
            .select("*")
            .order("created_at", desc=False)
            .limit(200)
            .execute()
            .data
            or []
        )
        return {
            "items": [_serialize_schedule(r) for r in rows],
            "total": len(rows),
        }

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to list discovery schedules")
        raise HTTPException(status_code=500, detail=_safe_error("list discovery schedules", e))


@router.post(
    "/admin/discovery/schedules",
    status_code=status.HTTP_201_CREATED,
    response_model=AdminScheduleRow,
)
async def create_admin_schedule(
    request: Request,
    body: AdminScheduleCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new discovery schedule row.

    The worker will pick the row up on its next polling cycle if
    ``enabled=true`` and ``next_run_at`` is in the past or unset.
    """
    require_admin(current_user)
    _validate_schedule_lists(body.pillars_to_scan, body.categories_to_scan)

    def insert_row() -> dict[str, Any]:
        payload = _coerce_schedule_payload(body)
        # Default next_run_at to "now + interval" if the caller didn't set it,
        # so a freshly-created enabled schedule actually fires.
        if "next_run_at" not in payload:
            interval = payload.get("interval_hours") or 24
            payload["next_run_at"] = (
                datetime.now(timezone.utc) + timedelta(hours=interval)
            ).isoformat()
        result = (
            supabase.table("discovery_schedule").insert(payload).execute()
        )
        rows = result.data or []
        if not rows:
            raise HTTPException(
                status_code=500, detail="Failed to create schedule"
            )
        return rows[0]

    try:
        row = await asyncio.to_thread(insert_row)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to create discovery schedule")
        raise HTTPException(status_code=500, detail=_safe_error("create discovery schedule", e))

    await asyncio.to_thread(
        log_admin_action,
        actor=current_user,
        action="admin.schedule.create",
        target_type="schedule",
        target_id=str(row.get("id")),
        before=None,
        after=_serialize_schedule(row),
        request=request,
    )
    return _serialize_schedule(row)


@router.patch(
    "/admin/discovery/schedules/{schedule_id}",
    response_model=AdminScheduleRow,
)
async def update_admin_schedule(
    request: Request,
    schedule_id: str,
    body: AdminScheduleUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Patch an existing discovery schedule.

    Only fields present in the JSON body are written; everything else stays
    at the row's current value. Empty bodies are rejected so each audit-log
    entry corresponds to a real change.
    """
    require_admin(current_user)
    _validate_schedule_lists(body.pillars_to_scan, body.categories_to_scan)

    payload = _coerce_schedule_payload(body)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    def patch_row() -> tuple[dict[str, Any], dict[str, Any]]:
        existing = (
            supabase.table("discovery_schedule")
            .select("*")
            .eq("id", schedule_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Schedule not found")
        before_row = copy.deepcopy(existing[0])
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = (
            supabase.table("discovery_schedule")
            .update(payload)
            .eq("id", schedule_id)
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise HTTPException(
                status_code=500, detail="Failed to update schedule"
            )
        return before_row, rows[0]

    try:
        before, after = await asyncio.to_thread(patch_row)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update discovery schedule")
        raise HTTPException(status_code=500, detail=_safe_error("update discovery schedule", e))

    await asyncio.to_thread(
        log_admin_action,
        actor=current_user,
        action="admin.schedule.update",
        target_type="schedule",
        target_id=schedule_id,
        before=_serialize_schedule(before),
        after=_serialize_schedule(after),
        request=request,
    )
    return _serialize_schedule(after)


@router.delete(
    "/admin/discovery/schedules/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_admin_schedule(
    request: Request,
    schedule_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a discovery schedule.

    Past discovery_runs and discovered_sources are unaffected — only the
    schedule row is removed. The audit row's ``before`` snapshot is what
    operators use to recover deleted schedules from the audit log if needed.
    """
    require_admin(current_user)

    def remove_row() -> dict[str, Any]:
        existing = (
            supabase.table("discovery_schedule")
            .select("*")
            .eq("id", schedule_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Schedule not found")
        before_row = copy.deepcopy(existing[0])
        (
            supabase.table("discovery_schedule")
            .delete()
            .eq("id", schedule_id)
            .execute()
        )
        return before_row

    try:
        before = await asyncio.to_thread(remove_row)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete discovery schedule")
        raise HTTPException(status_code=500, detail=_safe_error("delete discovery schedule", e))

    await asyncio.to_thread(
        log_admin_action,
        actor=current_user,
        action="admin.schedule.delete",
        target_type="schedule",
        target_id=schedule_id,
        before=_serialize_schedule(before),
        after=None,
        request=request,
    )
    return None
