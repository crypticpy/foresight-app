"""Admin endpoints for the discovery pipeline (aggregator).

Owns the ``/admin/...`` discovery-side surface: balance dispatch,
force-scan, run-detail lookup, and schedule CRUD. Coverage dashboards
(``/admin/coverage/*`` + ``/admin/csp-goals/{id}/refresh-queries``) live
in the sibling sub-router ``admin_discovery_coverage.py`` and
source-catalog CRUD (``/admin/sources*``) lives in
``admin_discovery_sources.py``; both are mounted here via
``router.include_router(...)``.

The mutating endpoints reuse ``log_admin_action`` from
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
from app.deps import _safe_error, get_current_user, limiter, supabase
from app.models import (
    AdminScheduleRow,
    AdminSchedulesListResponse,
    AdminWorkstreamScanResponse,
    BalanceDispatchResponse,
    DiscoveryRunDetailResponse,
)

from . import admin_discovery_coverage, admin_discovery_sources

# Re-exports for back-compat with tests that still reach into this module by
# attribute (e.g. ``admin_discovery.get_pillar_coverage``). Production code
# should import from the sub-router directly.
from .admin_discovery_coverage import (  # noqa: F401
    _aggregate_workstream_freshness,
    admin_refresh_goal_queries,
    get_coverage_gaps,
    get_pillar_coverage,
    get_workstream_coverage,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["admin-discovery"])

# Source-catalog CRUD (`/admin/sources*`) and coverage dashboards
# (`/admin/coverage/*`) live in sibling sub-routers so this file stays
# focused on balance + ops + schedules. The sub-routers carry no prefix;
# the `/api/v1` prefix is applied here at the aggregator boundary.
router.include_router(admin_discovery_sources.router)
router.include_router(admin_discovery_coverage.router)


# ---------------------------------------------------------------------------
# PR-E: Coverage-balance dispatcher
# ---------------------------------------------------------------------------
#
# Hands the operator one button that says "fill the gap": pick the starved
# CSP goals (auto or by id), translate each to web-search queries via the
# PR-D service, queue a discovery_runs row carrying those queries plus a
# pillar filter, and return the run_id so the UI can link to Operations.
#
# Why this lives in admin_discovery.py: the discovery router already owns
# the discovery_runs insert pattern (see `trigger_discovery_run`), and this
# endpoint is fundamentally an admin shortcut around that same row insert
# with a balancer-shaped config. Keeping it next to the gap detector keeps
# the coverage-balancer surface in one file.

# Cap the number of goals one balance dispatch will target. Each goal can
# produce up to MAX_QUERIES_PER_GOAL_CAP queries, so 5 * 4 = 20 — that's
# the discovery service's global per-run query budget. Going above this
# risks the run silently dropping queries past the cap.
BALANCE_MAX_GOALS = 5
BALANCE_DEFAULT_QUERIES_PER_GOAL = 4
BALANCE_MAX_QUERIES_PER_GOAL = 6  # Mirrors csp_goal_query_service.MAX_QUERIES.
BALANCE_GLOBAL_QUERY_CAP = 20
BALANCE_DEFAULT_CATEGORIES = ("rss", "web_search")


class BalanceDispatchRequest(BaseModel):
    """Payload for the coverage-balance dispatcher.

    All fields optional. When ``goal_ids`` is empty / omitted the dispatcher
    auto-picks the highest-drift CSP goals from the same data the gap
    detector surfaces.
    """

    goal_ids: list[str] | None = Field(
        default=None,
        description="UUIDs of csp_goals to target. When omitted, auto-derive from gaps.",
    )
    max_queries_per_goal: int = Field(
        default=BALANCE_DEFAULT_QUERIES_PER_GOAL,
        ge=1,
        le=BALANCE_MAX_QUERIES_PER_GOAL,
        description="Cap on queries kept per goal. Hard cap is the service's MAX_QUERIES.",
    )
    categories: list[str] | None = Field(
        default=None,
        description=(
            "Source categories to enable for this run. Defaults to "
            "['rss', 'web_search']. Pass an explicit list to override."
        ),
    )
    window_days: int = Field(
        default=30,
        description="Lookback window for the auto-pick gap query. Ignored when goal_ids is set.",
    )


async def _auto_pick_starved_goals(window_days: int) -> list[dict[str, Any]]:
    """Return the most-starved goals in the window, capped at ``BALANCE_MAX_GOALS``.

    Reads the same data the gap detector uses (cards.csp_goal_ids + csp_goals)
    but skips the priority-band bookkeeping — for dispatch we only need the
    ordering. Inlined here so this endpoint doesn't depend on PR-C's gap
    endpoint being merged.
    """
    since_dt = datetime.now(timezone.utc) - timedelta(days=window_days)

    def fetch() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        goals_resp = (
            supabase.table("csp_goals")
            .select("id,code,name,pillar_code")
            .execute()
        )
        cards_resp = (
            supabase.table("cards")
            .select("csp_goal_ids,created_at")
            .gte("created_at", since_dt.isoformat())
            # Match the coverage widget: archived/deleted cards shouldn't
            # mask a gap. Without this, a goal whose recent cards were all
            # archived would look "covered" and skip the dispatcher.
            .eq("status", "active")
            .execute()
        )
        return goals_resp.data or [], cards_resp.data or []

    goals, cards = await asyncio.to_thread(fetch)
    if not goals:
        return []

    goal_index = {g["id"]: g for g in goals}
    counts: dict[str, int] = {g["id"]: 0 for g in goals}
    total_links = 0
    for card in cards:
        for gid in card.get("csp_goal_ids") or []:
            if gid in counts:
                counts[gid] += 1
                total_links += 1

    # ``counts`` is keyed off ``goals`` (guarded non-empty above), so it
    # can never be empty here.
    expected = total_links / len(counts)
    # Drift score: (actual - expected) / max(expected, 1) so a 0-count goal
    # against expected=12 yields -1.0 and sorts to the top.
    scored: list[tuple[float, dict[str, Any]]] = []
    for gid, count in counts.items():
        drift_score = (count - expected) / max(expected, 1.0)
        scored.append((drift_score, goal_index[gid]))
    scored.sort(key=lambda x: x[0])
    return [g for _score, g in scored[:BALANCE_MAX_GOALS]]


@router.post(
    "/admin/discovery/balance",
    status_code=status.HTTP_201_CREATED,
    response_model=BalanceDispatchResponse,
)
@limiter.limit("10/minute")
async def admin_balance_dispatch(
    request: Request,
    body: BalanceDispatchRequest | None = None,
    current_user: dict = Depends(get_current_user),
):
    """Queue a targeted discovery run aimed at starved CSP goals.

    The operator clicks "Balance now" (or hits this endpoint directly). We:

    1. Pick goals — explicit ``goal_ids`` if supplied, otherwise the
       highest-drift cells in the last 30 days (auto cap ``BALANCE_MAX_GOALS``).
    2. Translate each goal to queries via ``csp_goal_query_service`` (cached
       — only the first call per goal hits the LLM).
    3. Trim per-goal queries to ``max_queries_per_goal`` and the union to
       ``BALANCE_GLOBAL_QUERY_CAP``.
    4. Insert a ``discovery_runs`` row with the balancer config in
       ``summary_report.config`` so the worker picks it up via the same
       claim path manual / scheduled runs use.

    Returns ``{run_id, goals_used, queued_queries}`` so the UI can link to
    Operations and the operator can verify which goals fired.
    """
    require_admin(current_user)

    # Local imports — csp_goal_query_service pulls openai_provider at import
    # time, and admin_discovery is imported on every API boot.
    from uuid import UUID as _UUID
    from uuid import uuid4

    from app import csp_goal_query_service
    from app.cost_guardrail import check_budget_or_raise
    from app.models import CustomQuerySpec

    payload = body or BalanceDispatchRequest()
    await check_budget_or_raise()  # 503 with friendly detail if tripped.

    # Resolve goals.
    if payload.goal_ids:
        try:
            parsed_ids = [_UUID(g) for g in payload.goal_ids]
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail=f"goal_ids must be UUIDs: {exc}"
            ) from exc
        if len(parsed_ids) > BALANCE_MAX_GOALS:
            raise HTTPException(
                status_code=400,
                detail=f"At most {BALANCE_MAX_GOALS} goal_ids per dispatch.",
            )

        def fetch_explicit() -> list[dict[str, Any]]:
            return (
                supabase.table("csp_goals")
                .select("id,code,name,pillar_code")
                .in_("id", [str(g) for g in parsed_ids])
                .execute()
                .data
                or []
            )

        goals = await asyncio.to_thread(fetch_explicit)
        if len(goals) != len(parsed_ids):
            missing = {str(g) for g in parsed_ids} - {g["id"] for g in goals}
            raise HTTPException(
                status_code=404, detail=f"Unknown goal_ids: {sorted(missing)}"
            )
    else:
        if payload.window_days not in (7, 30, 90):
            raise HTTPException(
                status_code=400,
                detail="window_days must be one of 7, 30, 90",
            )
        goals = await _auto_pick_starved_goals(payload.window_days)
        if not goals:
            raise HTTPException(
                status_code=404,
                detail="No active CSP goals available for auto-pick.",
            )

    # Translate each goal -> queries.
    queries: list[CustomQuerySpec] = []
    goals_used: list[dict[str, Any]] = []
    pillars_seen: set[str] = set()
    derivation_errors: list[dict[str, Any]] = []

    for goal in goals:
        try:
            derived = await csp_goal_query_service.derive_queries(_UUID(goal["id"]))
        except csp_goal_query_service.QueryDerivationError as exc:
            # One bad goal shouldn't drop the whole batch — record and skip.
            derivation_errors.append(
                {"goal_id": goal["id"], "code": goal.get("code"), "error": str(exc)}
            )
            continue
        trimmed = derived[: payload.max_queries_per_goal]
        if not trimmed:
            continue
        pillar = (goal.get("pillar_code") or "").strip()
        if not pillar:
            # Goal without a pillar code is meaningless to the discovery
            # pipeline's pillar-bucketed scoring. Skip.
            derivation_errors.append(
                {
                    "goal_id": goal["id"],
                    "code": goal.get("code"),
                    "error": "goal has no pillar_code",
                }
            )
            continue
        added = 0
        for q in trimmed:
            if len(queries) >= BALANCE_GLOBAL_QUERY_CAP:
                break
            queries.append(
                CustomQuerySpec(
                    query_text=q, pillar_code=pillar, source_context="balance"
                )
            )
            added += 1
        if added == 0:
            continue
        pillars_seen.add(pillar)
        goals_used.append(
            {
                "id": goal["id"],
                "code": goal.get("code"),
                "name": goal.get("name"),
                "pillar_code": pillar,
                "query_count": added,
            }
        )
        if len(queries) >= BALANCE_GLOBAL_QUERY_CAP:
            break

    if not queries:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "No usable queries derived for the selected goals.",
                "errors": derivation_errors,
            },
        )

    categories = payload.categories or list(BALANCE_DEFAULT_CATEGORIES)

    # Build the persisted run config — this is what the worker will read
    # back via ``summary_report.config`` (see worker.py:408). The shape must
    # match ``DiscoveryConfigRequest``.
    run_id = str(uuid4())
    resolved_config = {
        "max_queries_per_run": min(len(queries), BALANCE_GLOBAL_QUERY_CAP),
        "max_sources_total": 200,
        "auto_approve_threshold": 0.95,
        "pillars_filter": sorted(pillars_seen),
        "dry_run": False,
        "categories_to_scan": categories,
        "source_ids": None,
        "custom_queries": [q.model_dump() for q in queries],
        # Multi-source must stay on: it is the RSS/news/government fetch path,
        # which `categories_to_scan` then filters down. Disabling it skips RSS
        # entirely, leaving only the gpt-researcher web_search path — and that
        # path frequently exhausts its 120s per-query timeout on broad goal-
        # derived queries, producing 0 sources. Verified end-to-end on
        # run b3c14108 (multi_source=True → 36 sources, 7 cards) vs
        # run f3e1b489 (multi_source=False → 0 sources, 0 cards).
        "enable_multi_source": True,
    }

    run_record = {
        "id": run_id,
        "status": "running",
        "triggered_by": "manual",
        "triggered_by_user": current_user["id"],
        "summary_report": {
            "stage": "queued",
            "config": resolved_config,
            "balance": {
                "goals": goals_used,
                "derivation_errors": derivation_errors,
            },
        },
        "cards_created": 0,
        "cards_enriched": 0,
        "cards_deduplicated": 0,
        "sources_found": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "pillars_scanned": sorted(pillars_seen),
    }

    def insert_run() -> None:
        supabase.table("discovery_runs").insert(run_record).execute()

    try:
        await asyncio.to_thread(insert_run)
    except Exception as exc:
        logger.exception("Failed to enqueue balance discovery run")
        raise HTTPException(
            status_code=500, detail=_safe_error("enqueue balance discovery run", exc)
        ) from exc

    return {
        "run_id": run_id,
        "goals_used": goals_used,
        "queued_queries": [q.model_dump() for q in queries],
        "derivation_errors": derivation_errors,
        "categories": categories,
    }


@router.post(
    "/admin/workstreams/{workstream_id}/scan",
    status_code=status.HTTP_201_CREATED,
    response_model=AdminWorkstreamScanResponse,
)
async def admin_force_workstream_scan(
    request: Request,
    workstream_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Admin-initiated targeted scan of any workstream.

    The user-facing endpoint at ``POST /me/workstreams/{id}/scan`` requires
    the caller to own the workstream, which makes it useless for an admin
    triaging org workstreams from the freshness dashboard. This variant
    skips the ownership check (admin role still required) and writes the
    same ``workstream_scans`` row the worker already polls. It also writes
    an audit-log row so admin-initiated scans are distinguishable from
    user-initiated ones.
    """
    require_admin(current_user)

    def fetch_and_queue() -> dict[str, Any]:
        ws_resp = (
            supabase.table("workstreams")
            .select("id,name,user_id,keywords,pillar_ids,horizon,owner_type")
            .eq("id", workstream_id)
            .limit(1)
            .execute()
        )
        rows = ws_resp.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Workstream not found")
        ws = rows[0]
        keywords = ws.get("keywords") or []
        pillar_ids = ws.get("pillar_ids") or []
        if not keywords and not pillar_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Workstream has no keywords or pillars configured; "
                    "nothing to scan."
                ),
            )
        config: dict[str, Any] = {
            "workstream_id": workstream_id,
            # The scan worker keys some logging by user_id; preserve the WS
            # owner so admin-initiated scans show up under the right user
            # rather than the admin themselves.
            "user_id": ws.get("user_id"),
            "triggered_by": "admin",
            "admin_user_id": current_user.get("id"),
            "keywords": keywords,
            "pillar_ids": pillar_ids,
            "horizon": ws.get("horizon") or "ALL",
        }
        scan_record = {
            "workstream_id": workstream_id,
            # The DB has a NOT NULL on user_id — admin force-scan still
            # records as the workstream owner so the data model stays
            # consistent. The triggered_by/admin_user_id fields in config
            # carry the actual admin identity.
            "user_id": ws.get("user_id") or current_user.get("id"),
            "status": "queued",
            "config": config,
        }
        result = (
            supabase.table("workstream_scans").insert(scan_record).execute()
        )
        scan_rows = result.data or []
        if not scan_rows:
            raise HTTPException(
                status_code=500, detail="Failed to enqueue scan"
            )
        return {"workstream": ws, "scan": scan_rows[0]}

    try:
        outcome = await asyncio.to_thread(fetch_and_queue)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to force-scan workstream")
        raise HTTPException(status_code=500, detail=_safe_error("force-scan workstream", e))

    await asyncio.to_thread(
        log_admin_action,
        actor=current_user,
        action="admin.workstream.force_scan",
        target_type="workstream",
        target_id=workstream_id,
        before=None,
        after={
            "scan_id": outcome["scan"].get("id"),
            "workstream_name": outcome["workstream"].get("name"),
        },
        request=request,
    )
    return {
        "scan_id": outcome["scan"].get("id"),
        "workstream_id": workstream_id,
        "status": outcome["scan"].get("status", "queued"),
    }


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
