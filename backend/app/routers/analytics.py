"""Analytics and metrics router (aggregator).

This file owns the shared ``/api/v1`` prefix and ``analytics`` tag, mounts
focused sub-routers for endpoint clusters that have been extracted, and
hosts the remaining endpoints inline pending their own extraction.

Sub-routers mounted here
------------------------
* ``analytics_processing.py`` — ``GET /metrics/processing`` (monitoring
  dashboard aggregates over the last ``days`` window).
* ``analytics_dashboards.py`` — ``GET /analytics/pillar-coverage``,
  ``GET /analytics/velocity``, ``GET /analytics/top-domains``.
* ``analytics_insights.py`` — ``GET /analytics/insights`` (AI-generated
  strategic insights with 24-hour cache).
* ``analytics_system_stats.py`` — ``GET /analytics/system-stats``
  (comprehensive org-wide rollup of card counts, distributions,
  trending pillars, hot topics, and engagement metrics).

When extracting another endpoint cluster, add the import + an
``include_router`` line below. Do NOT change the parent prefix — keep
``/api/v1`` in exactly one place so the URL surface doesn't drift.
"""

from __future__ import annotations

import asyncio
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from . import (
    analytics_dashboards,
    analytics_insights,
    analytics_processing,
    analytics_system_stats,
)
from app.deps import supabase, get_current_user, _safe_error
from app.supabase_retry import execute_with_h2_retry
from app.models.analytics import (
    UserFollowItem,
    PopularCard,
    UserEngagementComparison,
    PillarAffinity,
    PersonalStats,
    AnchorOverview,
    CspGoalCoverage,
    SignalTypeMix,
    IssueTagCount,
    SparklinePoint,
    KpiSparkline,
    LensDelta24h,
    LensOverviewResponse,
)
from app.models.lens import (
    VALID_ANCHOR_CODES,
    AnchorScores,
    UserMetadata,
    effective_anchor_scores,
    effective_array,
)

# Re-export for back-compat: tests / legacy callers reach
# ``analytics.get_processing_metrics`` etc. by attribute. Production code
# should import from the sub-router directly.
get_processing_metrics = analytics_processing.get_processing_metrics
get_pillar_coverage = analytics_dashboards.get_pillar_coverage
get_trend_velocity = analytics_dashboards.get_trend_velocity
get_top_domains = analytics_dashboards.get_top_domains
get_analytics_insights = analytics_insights.get_analytics_insights
get_system_wide_stats = analytics_system_stats.get_system_wide_stats

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["analytics"])

# Mount sub-routers under the shared /api/v1 prefix.
router.include_router(analytics_processing.router)
router.include_router(analytics_dashboards.router)
router.include_router(analytics_insights.router)
router.include_router(analytics_system_stats.router)

# ============================================================================
# Constants
# ============================================================================

# Pillar definitions for analytics (matches database pillars table)
ANALYTICS_PILLAR_DEFINITIONS = {
    "CH": "Community Health & Sustainability",
    "EW": "Economic & Workforce Development",
    "HG": "High-Performing Government",
    "HH": "Homelessness & Housing",
    "MC": "Mobility & Critical Infrastructure",
    "PS": "Public Safety",
}

# Stage name mapping
STAGE_NAMES = {
    "1": "Concept",
    "2": "Exploring",
    "3": "Pilot",
    "4": "PoC",
    "5": "Implementing",
    "6": "Scaling",
    "7": "Mature",
    "8": "Declining",
}

# Horizon labels
HORIZON_LABELS = {
    "H1": "Near-term (0-2 years)",
    "H2": "Mid-term (2-5 years)",
    "H3": "Long-term (5+ years)",
}

# ============================================================================
# Routes
# ============================================================================


@router.get("/analytics/personal-stats", response_model=PersonalStats)
async def get_personal_stats(current_user: dict = Depends(get_current_user)):
    """
    Get personal analytics for the current user.

    Returns:
    - Cards the user is following
    - Comparison to community engagement
    - Pillar affinity analysis
    - Popular cards the user isn't following (social discovery)
    """
    try:
        user_id = current_user["id"]
        now = datetime.now(timezone.utc)
        one_week_ago = now - timedelta(days=7)

        # -------------------------------------------------------------------------
        # Batch 1: All independent queries in parallel
        # -------------------------------------------------------------------------

        (
            user_follows_resp,
            all_follows_resp,
            users_resp,
            user_ws_resp,
            all_ws_resp,
            user_ws_cards_resp,
        ) = await asyncio.gather(
            # User's follows with card join
            asyncio.to_thread(
                lambda: supabase.table("card_follows")
                .select(
                    "card_id, priority, created_at, cards(id, name, slug, pillar_id, horizon, velocity_score)"
                )
                .eq("user_id", user_id)
                .execute()
            ),
            # All follows (card_id, user_id, created_at) - single fetch for
            # follower counts, engagement comparison, and recently popular
            asyncio.to_thread(
                lambda: supabase.table("card_follows")
                .select("card_id, user_id, created_at")
                .execute()
            ),
            # All users for engagement percentile
            asyncio.to_thread(lambda: supabase.table("users").select("id").execute()),
            # User's workstreams count
            asyncio.to_thread(
                lambda: supabase.table("workstreams")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .execute()
            ),
            # All workstreams per user
            asyncio.to_thread(
                lambda: supabase.table("workstreams").select("user_id").execute()
            ),
            # User workstream cards
            asyncio.to_thread(
                lambda: supabase.table("workstream_cards")
                .select("card_id, workstreams!inner(user_id)")
                .eq("workstreams.user_id", user_id)
                .execute()
            ),
        )

        # -------------------------------------------------------------------------
        # User's Follows
        # -------------------------------------------------------------------------

        user_follows_data = user_follows_resp.data or []
        all_follows_data = all_follows_resp.data or []

        # Build follower counts from the single all_follows query
        card_follower_counts = Counter(
            f.get("card_id") for f in all_follows_data if f.get("card_id")
        )

        user_card_ids = set()
        following = []
        for f in user_follows_data:
            card = f.get("cards", {})
            if not card:
                continue
            card_id = card.get("id") or f.get("card_id")
            user_card_ids.add(card_id)

            followed_at = f.get("created_at")
            if followed_at:
                try:
                    followed_at = datetime.fromisoformat(
                        followed_at.replace("Z", "+00:00")
                    )
                except (ValueError, TypeError):
                    followed_at = now
            else:
                followed_at = now

            following.append(
                UserFollowItem(
                    card_id=card_id,
                    card_slug=card.get("slug"),
                    card_name=card.get("name", "Unknown"),
                    pillar_id=card.get("pillar_id"),
                    horizon=card.get("horizon"),
                    velocity_score=card.get("velocity_score"),
                    followed_at=followed_at,
                    priority=f.get("priority", "medium"),
                    follower_count=card_follower_counts.get(card_id, 1),
                )
            )

        total_following = len(following)

        # -------------------------------------------------------------------------
        # Engagement Comparison
        # -------------------------------------------------------------------------

        # User follow counts per user
        user_follow_counts = Counter(
            f.get("user_id") for f in all_follows_data if f.get("user_id")
        )
        all_follow_counts = list(user_follow_counts.values()) or [0]
        avg_follows = (
            sum(all_follow_counts) / len(all_follow_counts) if all_follow_counts else 0
        )

        user_workstream_count = user_ws_resp.count or 0

        ws_per_user = Counter(
            w.get("user_id") for w in (all_ws_resp.data or []) if w.get("user_id")
        )
        all_ws_counts = list(ws_per_user.values()) or [0]
        avg_workstreams = (
            sum(all_ws_counts) / len(all_ws_counts) if all_ws_counts else 0
        )

        # Calculate percentiles
        user_follows_count = user_follow_counts.get(user_id, 0)
        follows_below = sum(bool(c < user_follows_count) for c in all_follow_counts)
        user_percentile_follows = (
            (follows_below / len(all_follow_counts) * 100) if all_follow_counts else 0
        )

        ws_below = sum(bool(c < user_workstream_count) for c in all_ws_counts)
        user_percentile_workstreams = (
            (ws_below / len(all_ws_counts) * 100) if all_ws_counts else 0
        )

        engagement = UserEngagementComparison(
            user_follow_count=user_follows_count,
            avg_community_follows=round(avg_follows, 1),
            user_workstream_count=user_workstream_count,
            avg_community_workstreams=round(avg_workstreams, 1),
            user_percentile_follows=round(user_percentile_follows, 1),
            user_percentile_workstreams=round(user_percentile_workstreams, 1),
        )

        # -------------------------------------------------------------------------
        # Pillar Affinity
        # -------------------------------------------------------------------------

        # User's pillar distribution
        user_pillar_counts = Counter()
        for f in following:
            if f.pillar_id:
                user_pillar_counts[f.pillar_id] += 1

        # Community pillar distribution from all follows
        community_pillar_counts = Counter()
        all_card_ids = list(
            {f.get("card_id") for f in all_follows_data if f.get("card_id")}
        )
        if all_card_ids:
            cards_pillar_resp = await asyncio.to_thread(
                lambda: supabase.table("cards")
                .select("id, pillar_id")
                .in_("id", all_card_ids)
                .execute()
            )
            card_pillars = {
                c["id"]: c.get("pillar_id") for c in (cards_pillar_resp.data or [])
            }
            for f in all_follows_data:
                card_id = f.get("card_id")
                if pillar := card_pillars.get(card_id):
                    community_pillar_counts[pillar] += 1

        total_community_follows = sum(community_pillar_counts.values()) or 1

        pillar_affinity = []
        for code, name in ANALYTICS_PILLAR_DEFINITIONS.items():
            user_count = user_pillar_counts.get(code, 0)
            user_pct = (
                (user_count / total_following * 100) if total_following > 0 else 0
            )
            community_pct = (
                community_pillar_counts.get(code, 0) / total_community_follows * 100
            )
            affinity = user_pct - community_pct  # Positive = more interested than avg

            pillar_affinity.append(
                PillarAffinity(
                    pillar_code=code,
                    pillar_name=name,
                    user_count=user_count,
                    user_percentage=round(user_pct, 1),
                    community_percentage=round(community_pct, 1),
                    affinity_score=round(affinity, 1),
                )
            )

        # Sort by affinity score descending
        pillar_affinity.sort(key=lambda x: x.affinity_score, reverse=True)

        # -------------------------------------------------------------------------
        # Popular Cards Not Followed (Social Discovery)
        # -------------------------------------------------------------------------

        # Get most popular cards that user doesn't follow
        popular_card_ids = [
            cid
            for cid, count in card_follower_counts.most_common(20)
            if cid not in user_card_ids and count >= 2
        ][:10]

        popular_not_followed = []
        if popular_card_ids:
            popular_cards_resp = await asyncio.to_thread(
                lambda: supabase.table("cards")
                .select("id, name, slug, summary, pillar_id, horizon, velocity_score")
                .in_("id", popular_card_ids)
                .eq("status", "active")
                .execute()
            )

            for card in popular_cards_resp.data or []:
                card_id = card.get("id")
                popular_not_followed.append(
                    PopularCard(
                        card_id=card_id,
                        card_slug=card.get("slug"),
                        card_name=card.get("name", "Unknown"),
                        summary=card.get("summary", "")[:200],
                        pillar_id=card.get("pillar_id"),
                        horizon=card.get("horizon"),
                        velocity_score=card.get("velocity_score"),
                        follower_count=card_follower_counts.get(card_id, 0),
                        is_followed_by_user=False,
                    )
                )

        # -------------------------------------------------------------------------
        # Recently Popular (new follows in last week)
        # -------------------------------------------------------------------------

        # Reuse the all_follows_data already fetched (includes created_at)
        recent_card_counts = Counter()
        for f in all_follows_data:
            if created_at := f.get("created_at"):
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    if dt > one_week_ago:
                        recent_card_counts[f.get("card_id")] += 1
                except (ValueError, TypeError):
                    pass

        recently_popular_ids = [
            cid
            for cid, count in recent_card_counts.most_common(10)
            if cid not in user_card_ids and count >= 1
        ][:5]

        recently_popular = []
        if recently_popular_ids:
            recent_cards_resp = await asyncio.to_thread(
                lambda: supabase.table("cards")
                .select("id, name, slug, summary, pillar_id, horizon, velocity_score")
                .in_("id", recently_popular_ids)
                .eq("status", "active")
                .execute()
            )

            for card in recent_cards_resp.data or []:
                card_id = card.get("id")
                recently_popular.append(
                    PopularCard(
                        card_id=card_id,
                        card_slug=card.get("slug"),
                        card_name=card.get("name", "Unknown"),
                        summary=card.get("summary", "")[:200],
                        pillar_id=card.get("pillar_id"),
                        horizon=card.get("horizon"),
                        velocity_score=card.get("velocity_score"),
                        follower_count=recent_card_counts.get(card_id, 0),
                        is_followed_by_user=False,
                    )
                )

        # -------------------------------------------------------------------------
        # User Workstream Stats
        # -------------------------------------------------------------------------

        cards_in_workstreams = len(
            {
                c.get("card_id")
                for c in (user_ws_cards_resp.data or [])
                if c.get("card_id")
            }
        )

        # -------------------------------------------------------------------------
        # Build Response
        # -------------------------------------------------------------------------

        return PersonalStats(
            following=following,
            total_following=total_following,
            engagement=engagement,
            pillar_affinity=pillar_affinity,
            popular_not_followed=popular_not_followed,
            recently_popular=recently_popular,
            workstream_count=user_workstream_count,
            cards_in_workstreams=cards_in_workstreams,
            generated_at=now,
        )

    except Exception as e:
        logger.error(f"Failed to fetch personal stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("personal stats retrieval", e),
        ) from e


# ============================================================================
# Lens Overview — dashboard v2
# ============================================================================
# Aggregates over `cards.anchor_scores`, `csp_goal_ids`, `signal_type`,
# `issue_tags`, and the budget/climate assessments introduced in PR #26.
# Powers the strategic-anchor radar, CSP heatmap, signal-type donut,
# issue-tag chips, KPI sparklines, and 24-hour delta strip on the dashboard.

# Threshold for counting a card as a "high score" against an anchor.
LENS_HIGH_ANCHOR_SCORE = 70
# Triage gate above which we treat budget/climate as a flagged dimension.
# Mirrors the cascade's own gating (`lens_classification_service`).
LENS_FLAG_RELEVANCE = 60
# Cap on the issue-tag chip cloud — keeps the response payload bounded.
LENS_TOP_ISSUE_TAGS = 12


async def _fetch_all_paginated(
    builder_factory: Callable[[], Any], page_size: int = 1000
) -> list:
    """Fetch every row for a Supabase query, paginating in ``page_size`` chunks.

    PostgREST applies a server-side row cap (typically 1000) to a single
    ``.execute()``, so a naive call against an unbounded query silently
    truncates the result. We page with ``.range(start, end)`` until a partial
    page comes back. ``builder_factory`` returns a fresh query builder so
    filters/order are reapplied cleanly per page.

    Each page is dispatched via ``execute_with_h2_retry`` so that a transient
    HTTP/2 GOAWAY on Supabase's shared connection retries once rather than
    bubbling as a 500.
    """
    rows: list = []
    start = 0
    while True:
        # Default arg binds ``start`` for the thread closure.
        resp = await execute_with_h2_retry(
            lambda s=start: builder_factory()
            .range(s, s + page_size - 1)
            .execute()
        )
        page = resp.data or []
        rows.extend(page)
        if len(page) < page_size:
            break
        start += page_size
    return rows


def _parse_iso_ts(raw) -> Optional[datetime]:
    """Parse an ISO-8601 timestamp tolerantly (handles trailing 'Z')."""
    if not raw or not isinstance(raw, str):
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, AttributeError, TypeError):
        return None


def _daily_buckets(
    iso_timestamps: list, days: int, end: datetime
) -> List[SparklinePoint]:
    """Bucket a list of ISO-8601 timestamps into ``days`` daily counts.

    Always returns exactly ``days`` points in chronological order, with
    missing days zero-filled. Timestamps before the window start or after
    ``end`` are dropped silently.
    """
    counts: Dict[str, int] = {}
    window_start_date = (end - timedelta(days=days - 1)).date()
    end_date = end.date()
    for raw in iso_timestamps:
        if not raw:
            continue
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except (ValueError, AttributeError, TypeError):
            continue
        d = dt.date()
        if d < window_start_date or d > end_date:
            continue
        key = d.isoformat()
        counts[key] = counts.get(key, 0) + 1

    points: List[SparklinePoint] = []
    for offset in range(days):
        d = window_start_date + timedelta(days=offset)
        key = d.isoformat()
        points.append(SparklinePoint(date=key, value=counts.get(key, 0)))
    return points


def _parse_anchor_scores(raw: Optional[Dict]) -> Optional[AnchorScores]:
    """Tolerant parse — pre-PR-#26 cards have None or partial dicts."""
    if not raw:
        return None
    try:
        return AnchorScores(**raw)
    except Exception:
        return None


def _parse_user_metadata(raw: Optional[Dict]) -> UserMetadata:
    """Tolerant parse — pre-PR-#26 rows may have empty/legacy shapes."""
    if not raw:
        return UserMetadata.empty()
    try:
        return UserMetadata(**raw)
    except Exception:
        return UserMetadata.empty()


@router.get("/analytics/lens-overview", response_model=LensOverviewResponse)
async def get_lens_overview(
    days: int = Query(
        14, ge=7, le=90, description="Sparkline / activity window length"
    ),
    current_user: dict = Depends(get_current_user),
):
    """Aggregated lens metadata for the dashboard v2.

    Returns:
    - Anchor-score means (across all active cards with anchor data)
    - CSP goal coverage matrix
    - Signal-type mix
    - Top issue tags
    - Budget / climate flag counts
    - Daily sparklines for five KPIs over the window
    - 24-hour deltas (system-wide for cards/classifications, user-scoped
      for follows/workstreams)

    Each card's *effective* metadata is used: LLM-derived values overlaid
    with the requesting user's ``cards.user_metadata`` overrides and
    add/remove overlays. The classifier cascade never overwrites that
    layer, so a user's own edits are visible in their dashboard.
    """
    user_id = current_user["id"]
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=days)
    one_day_ago = now - timedelta(days=1)
    window_iso = window_start.isoformat()

    try:
        # Each query is paginated through `_fetch_all_paginated` so the active
        # corpus and 14-day windows can scale past PostgREST's 1000-row cap
        # without silently undercounting.
        (
            cards,
            goals,
            new_cards_data,
            updated_cards_data,
            classified_data,
            user_follows_data,
            user_ws_cards_data,
        ) = await asyncio.gather(
            # Active cards with the lens columns we aggregate over.
            _fetch_all_paginated(
                lambda: supabase.table("cards")
                .select(
                    "id, classifier_version, signal_type, anchor_scores, "
                    "csp_goal_ids, issue_tags, budget_assessment, "
                    "climate_assessment, user_metadata"
                )
                .eq("status", "active")
            ),
            # CSP goal labels for the heatmap.
            _fetch_all_paginated(
                lambda: supabase.table("csp_goals")
                .select("id, code, name, pillar_code, display_order")
                .order("pillar_code")
                .order("display_order")
            ),
            # Cards created in window — drives `new_cards` sparkline + 24h delta.
            _fetch_all_paginated(
                lambda: supabase.table("cards")
                .select("id, created_at")
                .gte("created_at", window_iso)
            ),
            # Cards updated in window — drives `updated_cards` sparkline.
            _fetch_all_paginated(
                lambda: supabase.table("cards")
                .select("id, updated_at")
                .gte("updated_at", window_iso)
            ),
            # Classifications stamped in window.
            _fetch_all_paginated(
                lambda: supabase.table("cards")
                .select("id, classified_at")
                .gte("classified_at", window_iso)
            ),
            # User's follows in window.
            _fetch_all_paginated(
                lambda: supabase.table("card_follows")
                .select("card_id, created_at")
                .eq("user_id", user_id)
                .gte("created_at", window_iso)
            ),
            # Cards added to user's workstreams in window.
            # `workstreams!inner(user_id)` filters at the DB level so the
            # postgrest server enforces ownership rather than us trusting the
            # client.
            _fetch_all_paginated(
                lambda: supabase.table("workstream_cards")
                .select("card_id, added_at, workstreams!inner(user_id)")
                .eq("workstreams.user_id", user_id)
                .gte("added_at", window_iso)
            ),
        )

        # ----------------------------------------------------------------
        # Snapshot aggregates — one pass over the active corpus.
        # ----------------------------------------------------------------
        anchor_score_sums: Dict[str, float] = {c: 0.0 for c in VALID_ANCHOR_CODES}
        anchor_high_counts: Dict[str, int] = {c: 0 for c in VALID_ANCHOR_CODES}
        anchor_scored_counts: Dict[str, int] = {c: 0 for c in VALID_ANCHOR_CODES}

        signal_type_counts: Counter = Counter()
        goal_card_counts: Counter = Counter()
        issue_tag_counts: Counter = Counter()
        budget_flag_count = 0
        climate_flag_count = 0
        classified_card_count = 0

        for card in cards:
            user_meta = _parse_user_metadata(card.get("user_metadata"))
            llm_anchor = _parse_anchor_scores(card.get("anchor_scores"))

            # Anchor scores — only count cards that have *some* anchor data
            # (LLM-set or user-overridden); cards from before PR #26 don't
            # contribute to the mean.
            if llm_anchor is not None or user_meta.overrides.get("anchor_scores"):
                base = llm_anchor or AnchorScores.zeros()
                effective = effective_anchor_scores(base, user_meta)
                eff_dump = effective.model_dump()
                for code in VALID_ANCHOR_CODES:
                    score = eff_dump.get(code, 0)
                    anchor_score_sums[code] += score
                    anchor_scored_counts[code] += 1
                    if score >= LENS_HIGH_ANCHOR_SCORE:
                        anchor_high_counts[code] += 1

            # Signal type — bucket null/unknown together as "unclassified".
            sig = card.get("signal_type")
            signal_type_counts[sig if sig else "unclassified"] += 1

            # CSP goal coverage — unique per card to avoid double counting.
            for gid in card.get("csp_goal_ids") or []:
                if gid:
                    goal_card_counts[gid] += 1

            # Issue tags — apply effective_array so user add/remove takes hold.
            llm_tags = card.get("issue_tags") or []
            for tag in effective_array(llm_tags, user_meta, "issue_tags"):
                issue_tag_counts[tag] += 1

            # Budget / climate flags — relevance >= 60 means the cascade
            # produced an actual assessment rather than a "skip" stub.
            budget = card.get("budget_assessment") or {}
            if isinstance(budget, dict):
                rel = budget.get("relevance")
                if isinstance(rel, (int, float)) and rel >= LENS_FLAG_RELEVANCE:
                    budget_flag_count += 1

            climate = card.get("climate_assessment") or {}
            if isinstance(climate, dict):
                rel = climate.get("relevance")
                if isinstance(rel, (int, float)) and rel >= LENS_FLAG_RELEVANCE:
                    climate_flag_count += 1

            if card.get("classifier_version"):
                classified_card_count += 1

        # Anchor means — guard against zero-card divisions.
        anchor_lookup = {
            "equity": "Equity",
            "affordability": "Affordability",
            "innovation": "Innovation",
            "sustainability_resiliency": "Sustainability & Resiliency",
            "proactive_prevention": "Proactive Prevention",
            "community_trust": "Community Trust & Relationships",
        }
        anchor_means: List[AnchorOverview] = []
        for code in VALID_ANCHOR_CODES:
            scored = anchor_scored_counts[code]
            mean = (anchor_score_sums[code] / scored) if scored else 0.0
            anchor_means.append(
                AnchorOverview(
                    code=code,
                    name=anchor_lookup[code],
                    mean_score=round(mean, 1),
                    high_score_count=anchor_high_counts[code],
                    scored_card_count=scored,
                )
            )

        # CSP coverage — preserves the seed's display order so the heatmap
        # rows match the framework UI elsewhere.
        csp_coverage = [
            CspGoalCoverage(
                goal_id=goal["id"],
                code=goal["code"],
                name=goal["name"],
                pillar_code=goal["pillar_code"],
                card_count=goal_card_counts.get(goal["id"], 0),
            )
            for goal in goals
        ]

        # Signal-type mix — fixed buckets so the donut has stable slices
        # even when the corpus is empty.
        signal_type_buckets = ["trend", "driver", "signal", "unclassified"]
        signal_mix = [
            SignalTypeMix(signal_type=t, count=signal_type_counts.get(t, 0))
            for t in signal_type_buckets
        ]

        top_tags = [
            IssueTagCount(tag=tag, count=count)
            for tag, count in issue_tag_counts.most_common(LENS_TOP_ISSUE_TAGS)
        ]

        # ----------------------------------------------------------------
        # Sparklines — five KPI series, all the same length (days).
        # ----------------------------------------------------------------
        sparklines = [
            KpiSparkline(
                metric="new_cards",
                points=_daily_buckets(
                    [r.get("created_at") for r in new_cards_data], days, now
                ),
            ),
            KpiSparkline(
                metric="updated_cards",
                points=_daily_buckets(
                    [r.get("updated_at") for r in updated_cards_data], days, now
                ),
            ),
            KpiSparkline(
                metric="new_classifications",
                points=_daily_buckets(
                    [r.get("classified_at") for r in classified_data], days, now
                ),
            ),
            KpiSparkline(
                metric="new_follows",
                points=_daily_buckets(
                    [r.get("created_at") for r in user_follows_data], days, now
                ),
            ),
            KpiSparkline(
                metric="new_workstream_cards",
                points=_daily_buckets(
                    [r.get("added_at") for r in user_ws_cards_data], days, now
                ),
            ),
        ]

        # ----------------------------------------------------------------
        # 24-hour deltas — cheap to derive from the same window slices.
        # Compares parsed datetimes (TZ-aware) rather than ISO strings, so
        # rows whose timestamp comes back with a different offset/precision
        # than ``one_day_ago_iso`` still bucket correctly.
        # ----------------------------------------------------------------
        def _count_since(rows: list, key: str, since_dt: datetime) -> int:
            n = 0
            for row in rows:
                ts = _parse_iso_ts(row.get(key))
                if ts is not None and ts >= since_dt:
                    n += 1
            return n

        delta = LensDelta24h(
            new_cards=_count_since(new_cards_data, "created_at", one_day_ago),
            new_classifications=_count_since(
                classified_data, "classified_at", one_day_ago
            ),
            new_follows=_count_since(user_follows_data, "created_at", one_day_ago),
            new_workstream_cards=_count_since(
                user_ws_cards_data, "added_at", one_day_ago
            ),
        )

        return LensOverviewResponse(
            anchor_means=anchor_means,
            csp_coverage=csp_coverage,
            signal_type_counts=signal_mix,
            top_issue_tags=top_tags,
            budget_flag_count=budget_flag_count,
            climate_flag_count=climate_flag_count,
            sparklines=sparklines,
            delta_24h=delta,
            classified_card_count=classified_card_count,
            total_active_cards=len(cards),
            period_days=days,
            generated_at=now,
        )

    except Exception as exc:
        logger.exception("lens-overview endpoint failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("lens overview retrieval", exc),
        ) from exc


