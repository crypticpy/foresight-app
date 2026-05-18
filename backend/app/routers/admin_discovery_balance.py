"""Coverage-balance dispatcher + admin force-scan (sub-router).

Endpoints
---------
* ``POST /admin/discovery/balance``                — queue a targeted
  discovery run aimed at starved CSP goals.
* ``POST /admin/workstreams/{id}/scan``            — admin-initiated
  workstream scan that bypasses the per-user ownership check.

This module is a FastAPI sub-router with no prefix; the parent aggregator
(``admin_discovery.py``) mounts it under the ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix at exactly one place
(the aggregator) so the URL surface doesn't drift.

Why these two endpoints share a file: both are "give the operator one
button to fill a gap" surfaces. They share the same audit-action shape
and the same expectations about admin-only access, and they are the
operational counterparts to the read-only coverage dashboards in
``admin_discovery_coverage.py``.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.audit_service import log_admin_action
from app.authz import require_admin
from app.deps import _safe_error, get_current_user, limiter, supabase
from app.models import (
    AdminWorkstreamScanResponse,
    BalanceDispatchResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin-discovery"])


# ---------------------------------------------------------------------------
# Coverage-balance dispatcher
# ---------------------------------------------------------------------------
#
# Hands the operator one button that says "fill the gap": pick the starved
# CSP goals (auto or by id), translate each to web-search queries via the
# csp_goal_query_service, queue a discovery_runs row carrying those queries
# plus a pillar filter, and return the run_id so the UI can link to
# Operations.
#
# Why this lives alongside admin_discovery.py's other ops surfaces: this
# endpoint is fundamentally an admin shortcut around the ``discovery_runs``
# row insert with a balancer-shaped config. Keeping it next to the gap
# detector (admin_discovery_coverage.py) keeps the coverage-balancer surface
# co-located.

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
    ordering. Inlined here so this endpoint doesn't depend on the gap
    endpoint living in the same module.
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


# ---------------------------------------------------------------------------
# Admin-initiated workstream scan
# ---------------------------------------------------------------------------


@router.post(
    "/admin/workstreams/{workstream_id}/scan",
    status_code=status.HTTP_201_CREATED,
    response_model=AdminWorkstreamScanResponse,
)
@limiter.limit("10/minute")
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

    # The scan is already enqueued in `workstream_scans`. Audit-log failure
    # must NOT turn a successful 201 into a 500 — that would invite client
    # retries and duplicate-queue the scan. Log the audit failure and move on.
    try:
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
    except Exception:
        logger.exception(
            "Forced scan queued, but audit logging failed",
            extra={
                "workstream_id": workstream_id,
                "scan_id": outcome["scan"].get("id"),
            },
        )
    return {
        "scan_id": outcome["scan"].get("id"),
        "workstream_id": workstream_id,
        "status": outcome["scan"].get("status", "queued"),
    }
