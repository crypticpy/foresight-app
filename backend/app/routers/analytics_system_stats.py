"""System-wide analytics sub-router.

Endpoints
---------
* ``GET /analytics/system-stats`` — comprehensive org-wide rollup of
  card counts, distributions across pillars / stages / horizons,
  trending pillars, hot topics, source / discovery / workstream /
  follow engagement.

This is a FastAPI sub-router with no prefix; the parent ``analytics``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

The pillar / stage / horizon constant dicts are kept as module-local
copies following the same pattern admin_discovery's sub-routers use.
The final aggregator-conversion PR in this series consolidates these
where duplication is worth a shared module.
"""

from __future__ import annotations

import asyncio
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, status

from app.analytics_pagination import fetch_all_paginated
from app.deps import _safe_error, get_current_user, supabase
from app.models.analytics import (
    DiscoveryStats,
    FollowStats,
    HorizonDistribution,
    PillarCoverageItem,
    SourceStats,
    StageDistribution,
    SystemWideStats,
    TrendingTopic,
    WorkstreamEngagement,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["analytics"])


# Pillar / stage / horizon definitions used by the system-stats rollup.
# Same data as ``taxonomy.PILLAR_NAMES`` and the parent ``analytics.py``
# copy. The aggregator-conversion PR at the end of this series will
# dedupe these.
ANALYTICS_PILLAR_DEFINITIONS = {
    "CH": "Community Health & Sustainability",
    "EW": "Economic & Workforce Development",
    "HG": "High-Performing Government",
    "HH": "Homelessness & Housing",
    "MC": "Mobility & Critical Infrastructure",
    "PS": "Public Safety",
}

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

HORIZON_LABELS = {
    "H1": "Near-term (0-2 years)",
    "H2": "Mid-term (2-5 years)",
    "H3": "Long-term (5+ years)",
}


@router.get("/analytics/system-stats", response_model=SystemWideStats)
async def get_system_wide_stats(current_user: dict = Depends(get_current_user)):
    """
    Get comprehensive system-wide analytics.

    Returns aggregated statistics about:
    - Total cards, sources, and discovery activity
    - Distribution by pillar, stage, and horizon
    - Trending topics and hot categories
    - Workstream and follow engagement metrics
    """
    try:
        now = datetime.now(timezone.utc)
        one_week_ago = now - timedelta(days=7)
        one_month_ago = now - timedelta(days=30)

        # -------------------------------------------------------------------------
        # Batch 1: All independent count & distribution queries in parallel
        # -------------------------------------------------------------------------

        # Distribution queries that select raw rows (no ``count="exact"``)
        # are routed through ``fetch_all_paginated`` — PostgREST applies a
        # ~1000-row cap to a single ``.execute()`` and a naive call silently
        # undercounts once the active corpus or workstream/follow tables
        # exceed that. ``count="exact"`` count-only requests are cheap and
        # stay on plain ``.execute()``.
        (
            total_cards_resp,
            active_cards_resp,
            cards_week_resp,
            cards_month_resp,
            pillar_data,
            stage_data,
            horizon_data,
            recent_pillar_data,
            hot_cards_resp,
            sources_resp,
            discovery_resp,
            search_resp,
            ws_resp,
            ws_cards_data,
            follows_data,
        ) = await asyncio.gather(
            # Core card counts (count-only — no row data)
            asyncio.to_thread(
                lambda: supabase.table("cards").select("id", count="exact").execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("cards")
                .select("id", count="exact")
                .eq("status", "active")
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("cards")
                .select("id", count="exact")
                .gte("created_at", one_week_ago.isoformat())
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("cards")
                .select("id", count="exact")
                .gte("created_at", one_month_ago.isoformat())
                .execute()
            ),
            # Distribution queries — paginate to avoid 1000-row truncation
            fetch_all_paginated(
                lambda: supabase.table("cards")
                .select("pillar_id, velocity_score")
                .eq("status", "active")
            ),
            fetch_all_paginated(
                lambda: supabase.table("cards")
                .select("stage_id")
                .eq("status", "active")
            ),
            fetch_all_paginated(
                lambda: supabase.table("cards")
                .select("horizon")
                .eq("status", "active")
            ),
            # Trending pillars (7-day window is small but still paginate
            # so a busy week doesn't silently truncate)
            fetch_all_paginated(
                lambda: supabase.table("cards")
                .select("pillar_id, velocity_score")
                .gte("created_at", one_week_ago.isoformat())
                .eq("status", "active")
            ),
            # Hot topics (intentionally bounded)
            asyncio.to_thread(
                lambda: supabase.table("cards")
                .select("name, velocity_score")
                .eq("status", "active")
                .gte("velocity_score", 70)
                .order("velocity_score", desc=True)
                .limit(5)
                .execute()
            ),
            # Sources — keep ``count="exact"`` for the total and use the
            # bounded sample for "this week" / per-type tallies. Going fully
            # paginated here would be a large round-trip count on busy orgs
            # and the 10K sample is enough for the per-type chart.
            asyncio.to_thread(
                lambda: supabase.table("sources")
                .select("id, source_type, created_at", count="exact")
                .limit(10000)
                .execute()
            ),
            # Discovery runs (bounded — only the most recent 1000 by design)
            asyncio.to_thread(
                lambda: supabase.table("discovery_runs")
                .select("id, cards_created, started_at, status")
                .limit(1000)
                .execute()
            ),
            # Search history (bounded — same)
            asyncio.to_thread(
                lambda: supabase.table("search_history")
                .select("id, executed_at", count="exact")
                .limit(1000)
                .execute()
            ),
            # Workstreams — count + row data for active-workstreams check
            asyncio.to_thread(
                lambda: supabase.table("workstreams")
                .select("id, updated_at", count="exact")
                .execute()
            ),
            # Workstream cards — paginate to keep ``unique_cards_in_ws``
            # honest past 1000 rows.
            fetch_all_paginated(
                lambda: supabase.table("workstream_cards").select("card_id")
            ),
            # Follows — paginate to keep ``unique_cards_followed`` and the
            # most-followed Counter honest past 1000 rows.
            fetch_all_paginated(
                lambda: supabase.table("card_follows").select("card_id, user_id")
            ),
        )

        # -------------------------------------------------------------------------
        # Core Card Stats
        # -------------------------------------------------------------------------

        total_cards = total_cards_resp.count or 0
        active_cards = active_cards_resp.count or 0
        cards_this_week = cards_week_resp.count or 0
        cards_this_month = cards_month_resp.count or 0

        # -------------------------------------------------------------------------
        # Cards by Pillar
        # -------------------------------------------------------------------------

        pillar_counts = Counter()
        pillar_velocity: Dict[str, list] = {}
        for card in pillar_data:
            if p := card.get("pillar_id"):
                pillar_counts[p] += 1
                if p not in pillar_velocity:
                    pillar_velocity[p] = []
                # ``is not None`` rather than truthy: a card with
                # ``velocity_score == 0`` is a legitimate data point and
                # excluding it (as ``if card.get("velocity_score"):`` did)
                # biases the pillar average upward.
                vel = card.get("velocity_score")
                if vel is not None:
                    pillar_velocity[p].append(vel)

        cards_by_pillar = []
        for code, name in ANALYTICS_PILLAR_DEFINITIONS.items():
            count = pillar_counts.get(code, 0)
            pct = (count / active_cards * 100) if active_cards > 0 else 0
            avg_vel = None
            if pillar_velocity.get(code):
                avg_vel = round(
                    sum(pillar_velocity[code]) / len(pillar_velocity[code]), 1
                )
            cards_by_pillar.append(
                PillarCoverageItem(
                    pillar_code=code,
                    pillar_name=name,
                    count=count,
                    percentage=round(pct, 1),
                    avg_velocity=avg_vel,
                )
            )

        # -------------------------------------------------------------------------
        # Cards by Stage
        # -------------------------------------------------------------------------

        stage_counts = Counter()
        for card in stage_data:
            if s := card.get("stage_id"):
                # Normalize stage_id - extract number from formats like "4_proof", "5_implementing"
                stage_str = str(s)
                stage_num = (
                    stage_str.split("_")[0]
                    if "_" in stage_str
                    else stage_str.replace("Stage ", "").strip()
                )
                stage_counts[stage_num] += 1

        cards_by_stage = []
        for stage_id, stage_name in STAGE_NAMES.items():
            count = stage_counts.get(stage_id, 0)
            pct = (count / active_cards * 100) if active_cards > 0 else 0
            cards_by_stage.append(
                StageDistribution(
                    stage_id=stage_id,
                    stage_name=stage_name,
                    count=count,
                    percentage=round(pct, 1),
                )
            )

        # -------------------------------------------------------------------------
        # Cards by Horizon
        # -------------------------------------------------------------------------

        horizon_counts = Counter()
        for card in horizon_data:
            if h := card.get("horizon"):
                horizon_counts[h] += 1

        cards_by_horizon = []
        for horizon, label in HORIZON_LABELS.items():
            count = horizon_counts.get(horizon, 0)
            pct = (count / active_cards * 100) if active_cards > 0 else 0
            cards_by_horizon.append(
                HorizonDistribution(
                    horizon=horizon, label=label, count=count, percentage=round(pct, 1)
                )
            )

        # -------------------------------------------------------------------------
        # Trending Pillars (based on recent card creation)
        # -------------------------------------------------------------------------

        recent_pillar_counts = Counter()
        recent_pillar_velocity: Dict[str, list] = {}
        for card in recent_pillar_data:
            if p := card.get("pillar_id"):
                recent_pillar_counts[p] += 1
                if p not in recent_pillar_velocity:
                    recent_pillar_velocity[p] = []
                # See pillar loop above — ``is not None`` so zero-velocity
                # cards aren't silently dropped from the trending average.
                vel = card.get("velocity_score")
                if vel is not None:
                    recent_pillar_velocity[p].append(vel)

        trending_pillars = []
        for code, count in recent_pillar_counts.most_common(6):
            name = ANALYTICS_PILLAR_DEFINITIONS.get(code, code)
            avg_vel = None
            if recent_pillar_velocity.get(code):
                avg_vel = round(
                    sum(recent_pillar_velocity[code])
                    / len(recent_pillar_velocity[code]),
                    1,
                )
            # Determine trend by comparing to historical average
            historical_count = pillar_counts.get(code, 0)
            weekly_avg = (
                historical_count / 4 if historical_count > 0 else 0
            )  # Rough 4-week avg
            trend = "stable"
            if count > weekly_avg * 1.5:
                trend = "up"
            elif count < weekly_avg * 0.5:
                trend = "down"
            trending_pillars.append(
                TrendingTopic(name=name, count=count, trend=trend, velocity_avg=avg_vel)
            )

        # -------------------------------------------------------------------------
        # Hot Topics (high velocity cards recently updated)
        # -------------------------------------------------------------------------

        hot_cards_data = hot_cards_resp.data or []

        hot_topics = [
            TrendingTopic(
                name=card.get("name", "Unknown"),
                count=1,
                trend="up",
                velocity_avg=card.get("velocity_score"),
            )
            for card in hot_cards_data
        ]

        # -------------------------------------------------------------------------
        # Source Statistics
        # -------------------------------------------------------------------------

        try:
            total_sources = sources_resp.count or 0
            sources_data = sources_resp.data or []

            # Sources this week
            sources_week = sum(
                bool(
                    s.get("created_at")
                    and datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
                    > one_week_ago
                )
                for s in sources_data
            )

            # Sources by type
            source_types = Counter()
            for s in sources_data:
                st = s.get("source_type") or "unknown"
                source_types[st] += 1

            source_stats = SourceStats(
                total_sources=total_sources,
                sources_this_week=sources_week,
                sources_by_type=dict(source_types),
            )
        except Exception as e:
            logger.warning(f"Could not fetch source stats: {e}")
            source_stats = SourceStats()

        # -------------------------------------------------------------------------
        # Discovery Statistics
        # -------------------------------------------------------------------------

        try:
            discovery_data = discovery_resp.data or []

            total_runs = len(discovery_data)
            completed_runs = [
                r for r in discovery_data if r.get("status") == "completed"
            ]
            runs_week = sum(
                bool(
                    r.get("started_at")
                    and datetime.fromisoformat(r["started_at"].replace("Z", "+00:00"))
                    > one_week_ago
                )
                for r in discovery_data
            )

            total_discovered = sum(r.get("cards_created", 0) for r in completed_runs)
            avg_per_run = (
                total_discovered / len(completed_runs) if completed_runs else 0
            )

            try:
                total_searches = search_resp.count or 0
                search_data = search_resp.data or []
                searches_week = sum(
                    bool(
                        s.get("executed_at")
                        and datetime.fromisoformat(
                            s["executed_at"].replace("Z", "+00:00")
                        )
                        > one_week_ago
                    )
                    for s in search_data
                )
            except Exception:
                total_searches = 0
                searches_week = 0

            discovery_stats = DiscoveryStats(
                total_discovery_runs=total_runs,
                runs_this_week=runs_week,
                total_searches=total_searches,
                searches_this_week=searches_week,
                cards_discovered=total_discovered,
                avg_cards_per_run=round(avg_per_run, 1),
            )
        except Exception as e:
            logger.warning(f"Could not fetch discovery stats: {e}")
            discovery_stats = DiscoveryStats()

        # -------------------------------------------------------------------------
        # Workstream Engagement
        # -------------------------------------------------------------------------

        try:
            total_workstreams = ws_resp.count or 0
            ws_data = ws_resp.data or []

            # Active workstreams (updated in last 30 days)
            active_workstreams = sum(
                bool(
                    w.get("updated_at")
                    and datetime.fromisoformat(w["updated_at"].replace("Z", "+00:00"))
                    > one_month_ago
                )
                for w in ws_data
            )

            unique_cards_in_ws = len(
                {c.get("card_id") for c in ws_cards_data if c.get("card_id")}
            )

            avg_cards_per_ws = (
                len(ws_cards_data) / total_workstreams if total_workstreams > 0 else 0
            )

            workstream_engagement = WorkstreamEngagement(
                total_workstreams=total_workstreams,
                active_workstreams=active_workstreams,
                unique_cards_in_workstreams=unique_cards_in_ws,
                avg_cards_per_workstream=round(avg_cards_per_ws, 1),
            )
        except Exception as e:
            logger.warning(f"Could not fetch workstream stats: {e}")
            workstream_engagement = WorkstreamEngagement()

        # -------------------------------------------------------------------------
        # Follow Statistics
        # -------------------------------------------------------------------------

        try:
            total_follows = len(follows_data)
            unique_cards_followed = len(
                {f.get("card_id") for f in follows_data if f.get("card_id")}
            )
            unique_users_following = len(
                {f.get("user_id") for f in follows_data if f.get("user_id")}
            )

            # Most followed cards
            card_follow_counts = Counter(
                f.get("card_id") for f in follows_data if f.get("card_id")
            )
            top_followed = card_follow_counts.most_common(5)

            # Get card names for top followed
            most_followed_cards = []
            if top_followed:
                top_card_ids = [c[0] for c in top_followed]
                cards_info = await asyncio.to_thread(
                    lambda: supabase.table("cards")
                    .select("id, name, slug")
                    .in_("id", top_card_ids)
                    .execute()
                )
                cards_map = {
                    c["id"]: {"name": c["name"], "slug": c.get("slug")}
                    for c in (cards_info.data or [])
                }

                for card_id, count in top_followed:
                    card_info = cards_map.get(
                        card_id, {"name": "Unknown", "slug": None}
                    )
                    most_followed_cards.append(
                        {
                            "card_id": card_id,
                            "card_slug": card_info.get("slug"),
                            "card_name": card_info.get("name", "Unknown"),
                            "follower_count": count,
                        }
                    )

            follow_stats = FollowStats(
                total_follows=total_follows,
                unique_cards_followed=unique_cards_followed,
                unique_users_following=unique_users_following,
                most_followed_cards=most_followed_cards,
            )
        except Exception as e:
            logger.warning(f"Could not fetch follow stats: {e}")
            follow_stats = FollowStats()

        # -------------------------------------------------------------------------
        # Build Response
        # -------------------------------------------------------------------------

        return SystemWideStats(
            total_cards=total_cards,
            active_cards=active_cards,
            cards_this_week=cards_this_week,
            cards_this_month=cards_this_month,
            cards_by_pillar=cards_by_pillar,
            cards_by_stage=cards_by_stage,
            cards_by_horizon=cards_by_horizon,
            trending_pillars=trending_pillars,
            hot_topics=hot_topics,
            source_stats=source_stats,
            discovery_stats=discovery_stats,
            workstream_engagement=workstream_engagement,
            follow_stats=follow_stats,
            generated_at=now,
        )

    except Exception as e:
        logger.error(f"Failed to fetch system-wide stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("system-wide stats retrieval", e),
        ) from e
