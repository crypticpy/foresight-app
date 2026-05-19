"""Personal analytics sub-router.

Endpoints
---------
* ``GET /analytics/personal-stats`` — per-user analytics: cards the
  user follows, engagement comparison vs. the community, pillar
  affinity, popular cards the user isn't following, recently
  popular new follows, and workstream counts.

This is a FastAPI sub-router with no prefix; the parent ``analytics``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

The pillar-definitions dict is kept as a module-local copy following
the same pattern admin_discovery's sub-routers use. The final
aggregator-conversion PR in this series consolidates these where
duplication is worth a shared module.
"""

from __future__ import annotations

import asyncio
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import _safe_error, get_current_user, supabase
from app.supabase_in_guard import chunked_in_query
from app.models.analytics import (
    PersonalStats,
    PillarAffinity,
    PopularCard,
    UserEngagementComparison,
    UserFollowItem,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["analytics"])


# Pillar definitions used by the personal-stats rollup. Same data as
# ``taxonomy.PILLAR_NAMES`` and the parent ``analytics.py`` copy. The
# aggregator-conversion PR at the end of this series will dedupe these.
ANALYTICS_PILLAR_DEFINITIONS = {
    "CH": "Community Health & Sustainability",
    "EW": "Economic & Workforce Development",
    "HG": "High-Performing Government",
    "HH": "Homelessness & Housing",
    "MC": "Mobility & Critical Infrastructure",
    "PS": "Public Safety",
}


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
            def _fetch_pillars(chunk):
                resp = (
                    supabase.table("cards")
                    .select("id, pillar_id")
                    .in_("id", chunk)
                    .execute()
                )
                return resp.data or []

            pillar_rows = await asyncio.to_thread(
                chunked_in_query, _fetch_pillars, all_card_ids
            )
            card_pillars = {
                c["id"]: c.get("pillar_id") for c in pillar_rows
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
