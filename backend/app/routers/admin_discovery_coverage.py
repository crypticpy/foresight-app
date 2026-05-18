"""Admin coverage dashboards (sub-router).

Endpoints
---------
* ``GET  /admin/coverage/pillars``         — cards-by-pillar histogram.
* ``GET  /admin/coverage/gaps``            — per-(pillar, csp_goal) drift heatmap.
* ``GET  /admin/coverage/workstreams``     — per-workstream freshness table.
* ``POST /admin/csp-goals/{id}/refresh-queries`` — force-rederive cached
  ``query_aliases`` for one CSP goal.

This module is a FastAPI sub-router with no prefix; the parent aggregator
(``admin_discovery.py``) mounts it under the ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix at exactly one place
(the aggregator) so the URL surface doesn't drift.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.authz import require_admin
from app.deps import _safe_error, get_current_user, limiter, supabase
from app.models import (
    AdminCspGoalRefreshQueriesResponse,
    AdminPillarCoverageResponse,
    CoverageGapsResponse,
    WorkstreamCoverageResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin-discovery"])


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Single source-of-truth for the six Austin strategic pillars used in the
# pillar-balance widget. Mirrors the database `pillars` table (and the
# existing analytics router definitions) — duplicated here so that we don't
# import a router-private constant.
PILLAR_DEFINITIONS: dict[str, str] = {
    "CH": "Community Health & Sustainability",
    "EW": "Economic & Workforce Development",
    "HG": "High-Performing Government",
    "HH": "Homelessness & Housing",
    "MC": "Mobility & Critical Infrastructure",
    "PS": "Public Safety",
}

# Allowed window sizes (days) for the pillar-balance histogram. We keep the
# set small so the cache key is tight and so the UI radio buttons map 1:1.
ALLOWED_COVERAGE_DAYS = (7, 30, 90)

# Aggregation modes for ``get_pillar_coverage``. ``primary`` is the original
# behavior (count ``cards.pillar_id`` only). ``primary_or_secondary`` adds
# ``secondary_pillars``. ``union`` additionally counts cards whose
# ``csp_goal_ids`` resolve to a goal under each pillar — this is the same
# notion of coverage the lens-overview endpoint uses, so the two views can
# finally agree on direction (see analytics.py:1856-2006).
ALLOWED_COVERAGE_MODES = ("primary", "primary_or_secondary", "union")
CoverageMode = Literal["primary", "primary_or_secondary", "union"]


# Drift-score thresholds for the gap detector. A drift_score of -1.0 means
# zero cards under that goal; -0.5 means "half the expected volume." We keep
# the bands wide enough that one short window doesn't flap a goal between
# bands every refresh.
GAP_PRIORITY_HIGH_THRESHOLD = -0.5
GAP_PRIORITY_MEDIUM_THRESHOLD = -0.25
TargetDistribution = Literal["uniform"]
ALLOWED_GAP_TARGETS = ("uniform",)


# ---------------------------------------------------------------------------
# Pillar coverage
# ---------------------------------------------------------------------------


@router.get(
    "/admin/coverage/pillars", response_model=AdminPillarCoverageResponse
)
async def get_pillar_coverage(
    days: int = 7,
    mode: CoverageMode = "primary",
    current_user: dict = Depends(get_current_user),
):
    """Cards-created-by-pillar histogram over the requested window.

    Used by the Coverage tab to spot pillar starvation. The expected share
    in the response is uniform across the six pillars (1/6 each). The UI
    can compare actual share vs expected share to flag drift.

    The ``mode`` selector decides which links count toward each pillar:

    - ``primary`` (default): only the primary ``cards.pillar_id``. Preserves
      the original behavior so cached clients keep working.
    - ``primary_or_secondary``: union of ``pillar_id`` and ``secondary_pillars``.
    - ``union``: also includes any pillar reachable via ``csp_goal_ids``
      (mapped through ``csp_goals.pillar_code``). This matches what the
      lens-overview endpoint counts, so the two views agree on direction.

    Regardless of mode, every bucket reports ``primary_cards``,
    ``secondary_cards`` and ``csp_linked_cards`` so the UI can show all
    three at once without re-fetching.

    Share semantics: ``share = bucket.cards / mode_total`` where
    ``mode_total = sum(mode_counts.values())``. In ``primary`` this is
    just the count of cards with a pillar assigned (``total - unassigned``)
    so a card with no pillar doesn't dilute the others. In the union
    modes, a single card may credit several pillars, so the denominator
    is the total number of pillar-touches; this keeps
    ``sum(share) == 1.0`` across pillars in every mode and makes the
    uniform 1/6 drift baseline meaningful regardless of mode. The raw
    card count is still returned as ``total`` (and the pillar-touch count
    as ``mode_total``) so callers can render both.
    """
    require_admin(current_user)
    if days not in ALLOWED_COVERAGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"days must be one of {sorted(ALLOWED_COVERAGE_DAYS)}",
        )
    if mode not in ALLOWED_COVERAGE_MODES:
        # FastAPI's Literal coercion catches this for query params, but the
        # explicit check guards against in-process callers (tests, the
        # gap-detector in PR-C) that pass through directly.
        raise HTTPException(
            status_code=400,
            detail=f"mode must be one of {list(ALLOWED_COVERAGE_MODES)}",
        )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    def load() -> dict[str, Any]:
        rows = (
            supabase.table("cards")
            .select("pillar_id,secondary_pillars,csp_goal_ids,created_at")
            .gte("created_at", cutoff)
            .eq("status", "active")
            .limit(10_000)
            .execute()
            .data
            or []
        )

        # Build a goal_id -> pillar_code map once. csp_goals is small (~23
        # rows) so a single full scan is cheaper than a per-card join.
        goal_rows = (
            supabase.table("csp_goals")
            .select("id,pillar_code")
            .limit(1_000)
            .execute()
            .data
            or []
        )
        goal_pillar: dict[str, str] = {}
        for g in goal_rows:
            gid = g.get("id")
            pc = g.get("pillar_code")
            if gid and pc in PILLAR_DEFINITIONS:
                goal_pillar[str(gid)] = pc

        primary_counts: dict[str, int] = {c: 0 for c in PILLAR_DEFINITIONS}
        secondary_counts: dict[str, int] = {c: 0 for c in PILLAR_DEFINITIONS}
        csp_counts: dict[str, int] = {c: 0 for c in PILLAR_DEFINITIONS}
        mode_counts: dict[str, int] = {c: 0 for c in PILLAR_DEFINITIONS}
        unassigned = 0

        for row in rows:
            primary = row.get("pillar_id")
            secondary = row.get("secondary_pillars") or []
            goal_ids = row.get("csp_goal_ids") or []

            primary_set: set[str] = set()
            if primary in PILLAR_DEFINITIONS:
                primary_set.add(primary)
                primary_counts[primary] += 1

            # A pillar listed in both primary and secondary still only counts
            # once toward ``secondary_cards`` for that pillar — the bucket
            # answers "is this pillar mentioned secondarily on any card",
            # not "how many secondary slots reference it."
            secondary_set: set[str] = set()
            for s in secondary:
                if s in PILLAR_DEFINITIONS and s not in secondary_set:
                    secondary_set.add(s)
                    secondary_counts[s] += 1

            csp_set: set[str] = set()
            for gid in goal_ids:
                pc = goal_pillar.get(str(gid))
                if pc and pc not in csp_set:
                    csp_set.add(pc)
                    csp_counts[pc] += 1

            if mode == "primary":
                touched = primary_set
            elif mode == "primary_or_secondary":
                touched = primary_set | secondary_set
            else:  # union
                touched = primary_set | secondary_set | csp_set

            if touched:
                for code in touched:
                    mode_counts[code] += 1
            else:
                unassigned += 1

        total = len(rows)
        # Share denominator. In ``primary`` each card credits at most one
        # pillar, so this equals total - unassigned. In the union modes a
        # card can credit several pillars, so this is the sum of all
        # mode-counts (pillar-touches). Using a mode-aware denominator
        # keeps ``sum(share) == 1.0`` across pillars in every mode, which
        # is what makes the uniform 1/6 drift baseline meaningful — a
        # raw-card denominator would let every drift go positive in union
        # modes and the starvation signal would stop working.
        mode_total = sum(mode_counts.values())
        # Expected share is uniform — six pillars, 1/6 each. Recorded so the
        # frontend can render a baseline line without re-deriving the
        # constant on its end.
        expected_share = round(1.0 / len(PILLAR_DEFINITIONS), 4)
        by_pillar: dict[str, dict[str, Any]] = {}
        for code, name in PILLAR_DEFINITIONS.items():
            cards = mode_counts[code]
            share = round(cards / mode_total, 4) if mode_total else 0.0
            by_pillar[code] = {
                "name": name,
                # ``cards`` reflects the selected mode so the UI can size
                # bars without branching on mode. The per-channel counts
                # below let the UI annotate the same bar with badges.
                "cards": cards,
                "primary_cards": primary_counts[code],
                "secondary_cards": secondary_counts[code],
                "csp_linked_cards": csp_counts[code],
                "share": share,
                "expected_share": expected_share,
                # Positive drift = over-represented; negative = starved. Lets
                # the UI sort or color-code without re-doing the math.
                "drift": round(share - expected_share, 4),
            }
        return {
            "window_days": days,
            "mode": mode,
            "since": cutoff,
            # ``total`` stays the raw card count so the UI's "N cards in
            # window" line is honest. ``mode_total`` is exposed so a caller
            # can verify it's the denominator for ``share`` (and so the
            # gap-detector in PR-C can reuse it).
            "total": total,
            "mode_total": mode_total,
            "unassigned": unassigned,
            "by_pillar": by_pillar,
        }

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to compute pillar coverage")
        raise HTTPException(status_code=500, detail=_safe_error("compute pillar coverage", e))


# ---------------------------------------------------------------------------
# Coverage gaps (drift heatmap)
# ---------------------------------------------------------------------------


def _gap_priority(drift_score: float) -> str:
    """Bucket a goal's drift_score into the priority bands the UI colors."""
    if drift_score <= GAP_PRIORITY_HIGH_THRESHOLD:
        return "high"
    if drift_score <= GAP_PRIORITY_MEDIUM_THRESHOLD:
        return "medium"
    return "none"


@router.get("/admin/coverage/gaps", response_model=CoverageGapsResponse)
@limiter.limit("30/minute")
async def get_coverage_gaps(
    request: Request,
    days: int = 30,
    target_distribution: TargetDistribution = "uniform",
    current_user: dict = Depends(get_current_user),
):
    """Per-(pillar, csp_goal) coverage heatmap with drift scores.

    The pillar-balance widget (``/admin/coverage/pillars``) tells operators
    *which pillar* is starved. This endpoint zooms one level in and tells
    them *which strategic goal* under that pillar is starved, so a balance
    run can target the specific gap rather than carpet-bombing the pillar.

    Aggregation: for each active card created within ``days``, every entry
    in its ``csp_goal_ids`` array contributes one credit to that goal's
    cell. The cell's ``pillar_code`` comes from ``csp_goals.pillar_code``.

    ``target_distribution=uniform`` (only mode for v1) sets the expected
    number of cards per goal to ``total_credits / total_goals``. ``drift``
    is ``cards_in_window - expected``; ``drift_score`` is ``drift / expected``
    clamped to ``[-1.0, +inf)``. ``priority`` is bucketed by ``drift_score``:

    - ``high``:   drift_score ≤ -0.5 (more than half short of expected)
    - ``medium``: drift_score ≤ -0.25
    - ``none``:   otherwise

    The cells list is sorted starvation-first (drift_score ascending) so
    the UI can render the heatmap with the worst-off goals on top.
    """
    require_admin(current_user)
    if days not in ALLOWED_COVERAGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"days must be one of {sorted(ALLOWED_COVERAGE_DAYS)}",
        )
    if target_distribution not in ALLOWED_GAP_TARGETS:
        raise HTTPException(
            status_code=400,
            detail=(
                "target_distribution must be one of "
                f"{list(ALLOWED_GAP_TARGETS)}"
            ),
        )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    def load() -> dict[str, Any]:
        # Explicit newest-first ordering on the card scan so that, if the
        # 10k cap ever bites (90d window on a very active tenant), the
        # truncation is deterministic and biased toward the most recent
        # cards — the ones the operator cares about for "what's starved
        # right now" decisions. Without an ORDER BY, Supabase's row order
        # is undefined.
        rows = (
            supabase.table("cards")
            .select("csp_goal_ids,created_at")
            .gte("created_at", cutoff)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(10_000)
            .execute()
            .data
            or []
        )

        # The csp_goals table is small (~23 rows) but order by display_order
        # so any future truncation behaves like the rest of the UI.
        goal_rows = (
            supabase.table("csp_goals")
            .select("id,code,name,pillar_code,display_order")
            .order("display_order", desc=False)
            .limit(1_000)
            .execute()
            .data
            or []
        )

        # Normalize the goal rows up-front: drop any with a missing id or an
        # unknown pillar_code so we never produce a cell the UI can't render.
        goals: list[dict[str, Any]] = []
        for g in goal_rows:
            gid = g.get("id")
            pc = g.get("pillar_code")
            if not gid or pc not in PILLAR_DEFINITIONS:
                continue
            goals.append(
                {
                    "id": str(gid),
                    "code": g.get("code") or "",
                    "name": g.get("name") or "",
                    "pillar_code": pc,
                    "display_order": g.get("display_order") or 0,
                }
            )

        goal_counts: dict[str, int] = {g["id"]: 0 for g in goals}
        total_credits = 0
        for row in rows:
            for gid in row.get("csp_goal_ids") or []:
                key = str(gid)
                if key in goal_counts:
                    goal_counts[key] += 1
                    total_credits += 1

        # Expected: uniform distribution across all goals. Falls back to 0
        # when there are no goals at all (empty seed DB) so the math never
        # divides by zero.
        expected_per_cell = (
            total_credits / len(goals) if goals else 0.0
        )

        cells: list[dict[str, Any]] = []
        for g in goals:
            cards_in_window = goal_counts[g["id"]]
            drift = cards_in_window - expected_per_cell
            if expected_per_cell > 0:
                # Clamp the negative tail to -1.0 — "zero coverage" is the
                # worst we can express, and a smaller denominator would let
                # the score balloon below -1 misleadingly.
                drift_score = max(-1.0, drift / expected_per_cell)
            else:
                # No data anywhere — flat 0 so the UI doesn't paint
                # everything as "high priority" on a fresh install.
                drift_score = 0.0
            cells.append(
                {
                    "pillar_code": g["pillar_code"],
                    "goal_id": g["id"],
                    "goal_code": g["code"],
                    "goal_name": g["name"],
                    "cards_in_window": cards_in_window,
                    "expected": round(expected_per_cell, 2),
                    "drift": round(drift, 2),
                    "drift_score": round(drift_score, 4),
                    "priority": _gap_priority(drift_score),
                }
            )

        # Starvation-first, then by pillar/goal code so the order is stable
        # across refreshes (no jitter from equal drift_scores). ``goal_id``
        # is the final tie-breaker because ``goal_code`` can be empty or
        # duplicated for seed rows and would otherwise allow row jitter.
        cells.sort(
            key=lambda c: (
                c["drift_score"],
                c["pillar_code"],
                c["goal_code"],
                c["goal_id"],
            )
        )

        underrepresented = sum(1 for c in cells if c["priority"] != "none")

        return {
            "window_days": days,
            "target_distribution": target_distribution,
            "since": cutoff,
            "cells": cells,
            "totals": {
                # Raw card count credited under at least one goal in window.
                # A card linked to multiple goals contributes once per goal.
                "credits": total_credits,
                "goals": len(goals),
                "expected_per_cell": round(expected_per_cell, 2),
                "underrepresented_cells": underrepresented,
            },
        }

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to compute coverage gaps")
        raise HTTPException(status_code=500, detail=_safe_error("compute coverage gaps", e))


# ---------------------------------------------------------------------------
# Workstream freshness
# ---------------------------------------------------------------------------


def _aggregate_workstream_freshness(
    workstreams: list[dict[str, Any]],
    completed_scans: list[dict[str, Any]],
    recent_scans: list[dict[str, Any]],
    recent_cards: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Join workstream rows with scan + card-add timestamps.

    Pure function so the test suite can hit it without a Supabase mock.
    """
    last_scanned: dict[str, Optional[str]] = {}
    for scan in completed_scans:
        ws_id = scan.get("workstream_id")
        if not ws_id:
            continue
        # Prefer completed_at; some schemas only set started_at on early
        # completions, so fall back to created_at to avoid a None gap.
        seen = (
            scan.get("completed_at")
            or scan.get("started_at")
            or scan.get("created_at")
        )
        prev = last_scanned.get(ws_id)
        if seen and (prev is None or seen > prev):
            last_scanned[ws_id] = seen

    scans_30d: dict[str, int] = {}
    for scan in recent_scans:
        ws_id = scan.get("workstream_id")
        if not ws_id:
            continue
        scans_30d[ws_id] = scans_30d.get(ws_id, 0) + 1

    cards_30d: dict[str, int] = {}
    for entry in recent_cards:
        ws_id = entry.get("workstream_id")
        if not ws_id:
            continue
        cards_30d[ws_id] = cards_30d.get(ws_id, 0) + 1

    rows: list[dict[str, Any]] = []
    for ws in workstreams:
        rows.append(
            {
                "id": ws.get("id"),
                "name": ws.get("name"),
                "owner_type": ws.get("owner_type") or "user",
                "auto_scan": bool(ws.get("auto_scan")),
                "last_scanned_at": last_scanned.get(ws.get("id")),
                "scans_30d": scans_30d.get(ws.get("id"), 0),
                "cards_added_30d": cards_30d.get(ws.get("id"), 0),
            }
        )

    # Stale-first ordering: NULL (never scanned) bubbles to the top, then
    # ascending by last_scanned_at. Within ties, preserve insertion order.
    rows.sort(
        key=lambda r: (
            r["last_scanned_at"] is not None,
            r["last_scanned_at"] or "",
        )
    )
    return rows


@router.get(
    "/admin/coverage/workstreams", response_model=WorkstreamCoverageResponse
)
async def get_workstream_coverage(
    current_user: dict = Depends(get_current_user),
):
    """Per-workstream freshness table sorted stale-first.

    Joins workstreams with their most recent completed scan, the count of
    scans in the last 30d, and the count of cards added to the workstream
    in the last 30d.
    """
    require_admin(current_user)
    cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    def load() -> dict[str, Any]:
        workstreams = (
            supabase.table("workstreams")
            .select("id,name,owner_type,auto_scan,user_id,created_at")
            .limit(2000)
            .execute()
            .data
            or []
        )
        # All-time most-recent-completed scans, capped at the latest 1000 so
        # we don't over-fetch on a long-lived deployment. For workstreams
        # whose last completed scan is older than this window the
        # last_scanned_at will appear None — which is the correct "very
        # stale" signal for the freshness widget anyway.
        completed_scans = (
            supabase.table("workstream_scans")
            .select("workstream_id,completed_at,started_at,created_at")
            .eq("status", "completed")
            .order("completed_at", desc=True)
            .limit(1000)
            .execute()
            .data
            or []
        )
        recent_scans = (
            supabase.table("workstream_scans")
            .select("workstream_id,created_at")
            .gte("created_at", cutoff_30d)
            .limit(5000)
            .execute()
            .data
            or []
        )
        recent_cards = (
            supabase.table("workstream_cards")
            .select("workstream_id,added_at")
            .gte("added_at", cutoff_30d)
            .limit(20_000)
            .execute()
            .data
            or []
        )
        items = _aggregate_workstream_freshness(
            workstreams, completed_scans, recent_scans, recent_cards
        )
        return {"items": items, "total": len(items)}

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to compute workstream coverage")
        raise HTTPException(status_code=500, detail=_safe_error("compute workstream coverage", e))


# ---------------------------------------------------------------------------
# CSP goal: refresh cached queries
# ---------------------------------------------------------------------------


@router.post(
    "/admin/csp-goals/{goal_id}/refresh-queries",
    response_model=AdminCspGoalRefreshQueriesResponse,
)
@limiter.limit("10/minute")
async def admin_refresh_goal_queries(
    request: Request,
    goal_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Force-rederive cached ``query_aliases`` for a CSP goal.

    Used by the operator when a goal's name/description changes mid-cycle
    and they want the next coverage-balance dispatch to use fresh queries
    instead of waiting for the cache-version stamp to roll. The handler is
    intentionally narrow: it triggers the same service the PR-E
    dispatcher will use, so there's exactly one code path that writes
    ``query_aliases``.
    """
    require_admin(current_user)
    # Local import: csp_goal_query_service pulls in the async OpenAI
    # client at import time, and we don't want to pay that cost on every
    # admin_discovery import (most admin endpoints don't touch the LLM).
    from uuid import UUID as _UUID

    from app import csp_goal_query_service

    try:
        parsed = _UUID(goal_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="goal_id must be a UUID"
        ) from exc

    try:
        queries = await csp_goal_query_service.derive_queries(parsed, force=True)
    except csp_goal_query_service.GoalNotFoundError as exc:
        # 404 — the goal_id doesn't resolve to a row. Distinct from 422
        # below so a typo'd UUID surfaces as "not found" rather than
        # "server couldn't produce a result" (which would prompt retries).
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except csp_goal_query_service.QueryDerivationError as exc:
        # 422 — goal exists but the LLM didn't yield a usable result. The
        # detail string makes the failure mode visible so the operator
        # knows whether to retry or fix the goal text.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to refresh queries for goal %s", goal_id)
        raise HTTPException(status_code=500, detail=_safe_error("refresh goal queries", exc)) from exc

    return {"goal_id": goal_id, "queries": queries, "count": len(queries)}
