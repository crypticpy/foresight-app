"""Admin endpoints for the discovery pipeline (aggregator).

Owns the ``/admin/...`` discovery-side surface: run-detail lookup and
schedule CRUD. The other discovery-admin slices live in sibling
sub-routers and are mounted here via ``router.include_router(...)``:

* ``admin_discovery_sources.py``  — ``/admin/sources*`` source-catalog CRUD.
* ``admin_discovery_coverage.py`` — ``/admin/coverage/*`` dashboards plus
  ``/admin/csp-goals/{id}/refresh-queries``.
* ``admin_discovery_balance.py``  — ``/admin/discovery/balance`` and
  ``/admin/workstreams/{id}/scan``.

The mutating endpoints in this file reuse ``log_admin_action`` from
``app.audit_service`` so every change shows up in the existing audit log.
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
from app.models import (
    AdminScheduleRow,
    AdminSchedulesListResponse,
    DiscoveryRunDetailResponse,
)

from . import (
    admin_discovery_balance,
    admin_discovery_coverage,
    admin_discovery_sources,
)

# Re-exports for back-compat with tests (and any external caller) that still
# reach into this module by attribute (e.g. ``admin_discovery.get_pillar_coverage``).
# Production code should import from the sub-router directly. We expose both
# the moved callables AND the moved constants/types so attribute lookups for
# anything that used to live here keep resolving. Explicit attribute
# assignments (rather than re-imports flagged unused-import) so the intent
# is obvious and the linter has nothing to suppress.
get_pillar_coverage = admin_discovery_coverage.get_pillar_coverage
get_coverage_gaps = admin_discovery_coverage.get_coverage_gaps
get_workstream_coverage = admin_discovery_coverage.get_workstream_coverage
admin_refresh_goal_queries = admin_discovery_coverage.admin_refresh_goal_queries
_aggregate_workstream_freshness = (
    admin_discovery_coverage._aggregate_workstream_freshness
)
_gap_priority = admin_discovery_coverage._gap_priority
PILLAR_DEFINITIONS = admin_discovery_coverage.PILLAR_DEFINITIONS
ALLOWED_COVERAGE_DAYS = admin_discovery_coverage.ALLOWED_COVERAGE_DAYS
ALLOWED_COVERAGE_MODES = admin_discovery_coverage.ALLOWED_COVERAGE_MODES
CoverageMode = admin_discovery_coverage.CoverageMode
TargetDistribution = admin_discovery_coverage.TargetDistribution
ALLOWED_GAP_TARGETS = admin_discovery_coverage.ALLOWED_GAP_TARGETS
GAP_PRIORITY_HIGH_THRESHOLD = admin_discovery_coverage.GAP_PRIORITY_HIGH_THRESHOLD
GAP_PRIORITY_MEDIUM_THRESHOLD = admin_discovery_coverage.GAP_PRIORITY_MEDIUM_THRESHOLD

# Balance + force-scan re-exports (same back-compat motivation as above).
admin_balance_dispatch = admin_discovery_balance.admin_balance_dispatch
admin_force_workstream_scan = admin_discovery_balance.admin_force_workstream_scan
BalanceDispatchRequest = admin_discovery_balance.BalanceDispatchRequest
_auto_pick_starved_goals = admin_discovery_balance._auto_pick_starved_goals
BALANCE_MAX_GOALS = admin_discovery_balance.BALANCE_MAX_GOALS
BALANCE_DEFAULT_QUERIES_PER_GOAL = admin_discovery_balance.BALANCE_DEFAULT_QUERIES_PER_GOAL
BALANCE_MAX_QUERIES_PER_GOAL = admin_discovery_balance.BALANCE_MAX_QUERIES_PER_GOAL
BALANCE_GLOBAL_QUERY_CAP = admin_discovery_balance.BALANCE_GLOBAL_QUERY_CAP
BALANCE_DEFAULT_CATEGORIES = admin_discovery_balance.BALANCE_DEFAULT_CATEGORIES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["admin-discovery"])

# Sibling sub-routers are mounted here so this file stays focused on the
# remaining run-detail + schedule CRUD endpoints. The sub-routers carry no
# prefix; the `/api/v1` prefix is applied here at the aggregator boundary.
router.include_router(admin_discovery_sources.router)
router.include_router(admin_discovery_coverage.router)
router.include_router(admin_discovery_balance.router)



# ---------------------------------------------------------------------------
# Run-detail (PR D)
# ---------------------------------------------------------------------------

# Columns we surface for each ``discovered_sources`` row in the detail view.
# We deliberately exclude ``full_content`` (potentially many KB per row) and
# ``content_embedding`` (1536-float vector) — neither helps the admin debug a
# run but together they would dominate the payload.
DISCOVERED_SOURCE_DETAIL_COLUMNS: tuple[str, ...] = (
    "id",
    "url",
    "title",
    "content_snippet",
    "domain",
    "source_type",
    "published_at",
    "search_query",
    "query_pillar",
    "query_priority",
    "triage_is_relevant",
    "triage_confidence",
    "triage_primary_pillar",
    "triage_reason",
    "triaged_at",
    "analysis_summary",
    "analysis_horizon",
    "analysis_suggested_card_name",
    "analysis_credibility",
    "analysis_novelty",
    "analysis_likelihood",
    "analysis_impact",
    "analysis_relevance",
    "analyzed_at",
    "dedup_status",
    "dedup_matched_card_id",
    "dedup_similarity_score",
    "deduplicated_at",
    "processing_status",
    "resulting_card_id",
    "resulting_source_id",
    "error_message",
    "error_stage",
    "created_at",
    "updated_at",
)

DISCOVERED_SOURCE_DETAIL_SELECT: str = ",".join(DISCOVERED_SOURCE_DETAIL_COLUMNS)

# Hard ceiling on aggregate-count fetch. A single run that produced more than
# this many sources is already pathological; the detail page should not be
# the place where we discover that.
MAX_AGGREGATE_FETCH = 50_000


def _aggregate_run_counts(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Pure aggregator over a list of discovered-source summary rows.

    Splitting this out keeps the route function thin and lets the unit tests
    feed in fixtures without touching Supabase at all. The keys are stable
    so the frontend can render them without re-deriving labels.
    """
    by_status: dict[str, int] = {}
    by_triage = {"passed": 0, "failed": 0, "pending": 0}
    by_error_stage: dict[str, int] = {}
    cards_created = 0
    cards_enriched = 0
    for row in rows:
        status_label = row.get("processing_status") or "unknown"
        by_status[status_label] = by_status.get(status_label, 0) + 1
        if status_label == "card_created":
            cards_created += 1
        elif status_label == "card_enriched":
            cards_enriched += 1
        triage_flag = row.get("triage_is_relevant")
        if triage_flag is True:
            by_triage["passed"] += 1
        elif triage_flag is False:
            by_triage["failed"] += 1
        else:
            by_triage["pending"] += 1
        stage = row.get("error_stage")
        if stage:
            by_error_stage[stage] = by_error_stage.get(stage, 0) + 1
    return {
        "by_processing_status": by_status,
        "by_triage": by_triage,
        "by_error_stage": by_error_stage,
        "card_outcomes": {
            "card_created": cards_created,
            "card_enriched": cards_enriched,
        },
    }


@router.get(
    "/admin/discovery/runs/{run_id}/detail",
    response_model=DiscoveryRunDetailResponse,
)
async def get_discovery_run_detail(
    run_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """Drill-down view of one ``discovery_runs`` row.

    Returns the run row, aggregate counts grouped by ``processing_status``,
    ``triage_is_relevant`` and ``error_stage``, plus a paginated slice of
    ``discovered_sources`` rows. The aggregate-count fetch is capped at
    ``MAX_AGGREGATE_FETCH`` so a runaway run doesn't blow up the response.
    The recover/reprocess action endpoints are left untouched — the UI just
    calls them; this endpoint only assembles the read model.
    """
    require_admin(current_user)
    if limit < 1 or limit > 200:
        raise HTTPException(
            status_code=400, detail="limit must be between 1 and 200"
        )
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    def load() -> dict[str, Any]:
        run_resp = (
            supabase.table("discovery_runs")
            .select(
                "id,started_at,completed_at,status,pillars_scanned,"
                "priorities_scanned,queries_generated,sources_found,"
                "sources_relevant,cards_created,cards_enriched,"
                "cards_deduplicated,estimated_cost,error_message,"
                "error_details,summary_report,triggered_by,"
                "triggered_by_user,created_at"
            )
            .eq("id", run_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not run_resp:
            raise HTTPException(status_code=404, detail="Discovery run not found")
        run_row = run_resp[0]

        # Light-weight rows for aggregate counts. Only the columns we
        # actually fold over so this stays cheap even if a run produced
        # thousands of sources.
        agg_rows = (
            supabase.table("discovered_sources")
            .select("processing_status,triage_is_relevant,error_stage")
            .eq("discovery_run_id", run_id)
            .limit(MAX_AGGREGATE_FETCH)
            .execute()
            .data
            or []
        )
        totals = _aggregate_run_counts(agg_rows)
        sources_total = len(agg_rows)
        truncated = sources_total >= MAX_AGGREGATE_FETCH

        page_rows = (
            supabase.table("discovered_sources")
            .select(DISCOVERED_SOURCE_DETAIL_SELECT)
            .eq("discovery_run_id", run_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
            .data
            or []
        )

        return {
            "run": run_row,
            "totals": {
                **totals,
                "sources_total": sources_total,
                "aggregate_truncated": truncated,
            },
            "sources": {
                "items": page_rows,
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(page_rows) < sources_total,
            },
        }

    try:
        return await asyncio.to_thread(load)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to load discovery run detail")
        raise HTTPException(status_code=500, detail=_safe_error("load discovery run detail", e))


# ---------------------------------------------------------------------------
# Schedule CRUD (PR E)
# ---------------------------------------------------------------------------
#
# The legacy single-row endpoints (``GET/PUT /api/v1/discovery/schedule``) stay
# wired up for back-compat — the worker also still polls the same table. These
# admin endpoints are a fully replicated CRUD surface that lets ops manage
# multiple schedules without touching SQL. Multi-row scheduling already works
# at the worker layer (``ForesightWorker._run_scheduled_discovery`` claims any
# enabled row whose ``next_run_at`` is past), so this router only needs to
# add the surface area, not rewire dispatch.

ALLOWED_SCHEDULE_CATEGORIES = (
    "rss",
    "news",
    "academic",
    "government",
    "tech_blog",
    "web_search",
)

ALLOWED_PILLAR_CODES = ("CH", "EW", "HG", "HH", "MC", "PS")


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
