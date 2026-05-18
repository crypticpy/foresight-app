"""Small analytics dashboards sub-router.

Groups three read-only dashboard endpoints that each weigh in around 100
lines or less:

* ``GET /analytics/pillar-coverage`` — distribution of active cards across
  the six strategic pillars, optionally filtered by date range and
  maturity stage.
* ``GET /analytics/velocity`` — time-series velocity aggregations with
  week-over-week change, optionally filtered by pillar / stage / date.
* ``GET /analytics/top-domains`` — leaderboard of source domains by
  composite-score, optionally filtered by category.

This is a FastAPI sub-router with no prefix; the parent ``analytics``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

The pillar-definitions dict is kept as a module-local copy following the
same pattern admin_discovery's sub-routers use. The final aggregator-
conversion PR in this series consolidates per-sub-router constants where
duplication is worth a shared module.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.deps import _safe_error, get_current_user, supabase
from app.models.analytics import (
    PillarCoverageItem,
    PillarCoverageResponse,
    VelocityDataPoint,
    VelocityResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["analytics"])


# Pillar definitions used by both pillar-coverage and velocity. Keeps the
# sub-router self-contained — same data as ``taxonomy.PILLAR_NAMES`` and
# the parent ``analytics.py`` copy. The aggregator-conversion PR at the
# end of this series will dedupe these.
ANALYTICS_PILLAR_DEFINITIONS = {
    "CH": "Community Health & Sustainability",
    "EW": "Economic & Workforce Development",
    "HG": "High-Performing Government",
    "HH": "Homelessness & Housing",
    "MC": "Mobility & Critical Infrastructure",
    "PS": "Public Safety",
}


@router.get("/analytics/pillar-coverage", response_model=PillarCoverageResponse)
async def get_pillar_coverage(
    current_user: dict = Depends(get_current_user),
    start_date: Optional[str] = Query(
        None, description="Start date filter (ISO format)"
    ),
    end_date: Optional[str] = Query(None, description="End date filter (ISO format)"),
    stage_id: Optional[str] = Query(None, description="Filter by maturity stage"),
):
    """
    Get activity distribution across strategic pillars.

    Returns counts and percentages for all 6 strategic pillars (CH, EW, HG, HH, MC, PS),
    showing how cards are distributed across the organization's strategic focus areas.

    Args:
        start_date: Optional start date filter (ISO format)
        end_date: Optional end date filter (ISO format)
        stage_id: Optional maturity stage filter

    Returns:
        PillarCoverageResponse with pillar distribution data
    """
    try:
        # Build query for active cards with velocity_score for avg calculation
        query = (
            supabase.table("cards")
            .select("pillar_id, velocity_score")
            .eq("status", "active")
        )

        # Apply date filters if provided
        if start_date:
            query = query.gte("created_at", start_date)
        if end_date:
            query = query.lte("created_at", end_date)

        # Apply stage filter if provided
        if stage_id:
            query = query.eq("stage_id", stage_id)

        response = await asyncio.to_thread(query.execute)
        cards_data = response.data or []

        # Count cards per pillar and sum velocity scores
        pillar_counts: Dict[str, int] = {}
        pillar_velocity_sums: Dict[str, float] = {}
        for pillar_code in ANALYTICS_PILLAR_DEFINITIONS.keys():
            pillar_counts[pillar_code] = 0
            pillar_velocity_sums[pillar_code] = 0.0

        # Also count cards with null/unknown pillar
        unassigned_count = 0
        for card in cards_data:
            pillar_id = card.get("pillar_id")
            if pillar_id and pillar_id in ANALYTICS_PILLAR_DEFINITIONS:
                pillar_counts[pillar_id] += 1
                velocity = card.get("velocity_score")
                if velocity is not None:
                    pillar_velocity_sums[pillar_id] += velocity
            else:
                unassigned_count += 1

        total_cards = len(cards_data)

        # Build response data with percentages and average velocity
        coverage_data = []
        for pillar_code, pillar_name in ANALYTICS_PILLAR_DEFINITIONS.items():
            count = pillar_counts[pillar_code]
            percentage = (count / total_cards * 100) if total_cards > 0 else 0.0
            avg_velocity = (
                pillar_velocity_sums[pillar_code] / count if count > 0 else None
            )
            coverage_data.append(
                PillarCoverageItem(
                    pillar_code=pillar_code,
                    pillar_name=pillar_name,
                    count=count,
                    percentage=round(percentage, 2),
                    avg_velocity=(
                        round(avg_velocity, 2) if avg_velocity is not None else None
                    ),
                )
            )

        # Sort by count descending for better visualization
        coverage_data.sort(key=lambda x: x.count, reverse=True)

        logger.info(
            f"Pillar coverage: {total_cards} cards analyzed, "
            f"{unassigned_count} unassigned"
        )

        return PillarCoverageResponse(
            data=coverage_data,
            total_cards=total_cards,
            period_start=start_date,
            period_end=end_date,
        )

    except Exception as e:
        logger.error(f"Failed to get pillar coverage: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("pillar coverage retrieval", e),
        ) from e


@router.get("/analytics/velocity", response_model=VelocityResponse)
async def get_trend_velocity(
    pillar_id: Optional[str] = None,
    stage_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get trend velocity analytics over time.

    Returns time-series data showing trend momentum, including:
    - Daily/weekly velocity aggregations
    - Week-over-week comparison
    - Card counts per time period

    Query parameters:
    - pillar_id: Filter by strategic pillar code (CH, EW, HG, HH, MC, PS)
    - stage_id: Filter by maturity stage ID
    - start_date: Start date in ISO format (YYYY-MM-DD)
    - end_date: End date in ISO format (YYYY-MM-DD)

    Returns:
        VelocityResponse with time-series velocity data
    """
    try:
        # Default to last 30 days if no date range specified
        if not end_date:
            end_dt = datetime.now(timezone.utc)
            end_date = end_dt.strftime("%Y-%m-%d")
        else:
            end_dt = datetime.fromisoformat(end_date)

        if not start_date:
            start_dt = end_dt - timedelta(days=30)
            start_date = start_dt.strftime("%Y-%m-%d")
        else:
            start_dt = datetime.fromisoformat(start_date)

        # Validate date range
        if start_dt > end_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date must be before or equal to end_date",
            )

        # Build query for cards
        query = (
            supabase.table("cards")
            .select("id, velocity_score, created_at, updated_at, pillar_id, stage_id")
            .eq("status", "active")
        )

        # Apply filters
        if pillar_id:
            if pillar_id not in ANALYTICS_PILLAR_DEFINITIONS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid pillar_id. Must be one of: {', '.join(ANALYTICS_PILLAR_DEFINITIONS.keys())}",
                )
            query = query.eq("pillar_id", pillar_id)

        if stage_id:
            query = query.eq("stage_id", stage_id)

        # Filter by date range on created_at
        query = query.gte("created_at", f"{start_date}T00:00:00")
        query = query.lte("created_at", f"{end_date}T23:59:59")

        response = await asyncio.to_thread(
            lambda: query.order("created_at", desc=False).execute()
        )

        cards = response.data or []
        total_cards = len(cards)

        # Aggregate velocity data by date
        daily_data = defaultdict(lambda: {"velocity_sum": 0, "count": 0, "scores": []})

        for card in cards:
            if created_at := card.get("created_at", ""):
                date_str = created_at[:10]  # YYYY-MM-DD
                velocity = card.get("velocity_score")
                if velocity is not None:
                    daily_data[date_str]["velocity_sum"] += velocity
                    daily_data[date_str]["scores"].append(velocity)
                daily_data[date_str]["count"] += 1

        # Convert to VelocityDataPoint list
        velocity_data = []
        for date_str in sorted(daily_data.keys()):
            day_info = daily_data[date_str]
            avg_velocity = None
            if day_info["scores"]:
                avg_velocity = round(
                    sum(day_info["scores"]) / len(day_info["scores"]), 2
                )

            velocity_data.append(
                VelocityDataPoint(
                    date=date_str,
                    velocity=day_info["velocity_sum"],
                    count=day_info["count"],
                    avg_velocity_score=avg_velocity,
                )
            )

        # Calculate week-over-week change
        week_over_week_change = None
        if len(velocity_data) >= 14:
            # Get last 7 days and previous 7 days
            last_week_data = velocity_data[-7:]
            prev_week_data = velocity_data[-14:-7]

            last_week_total = sum(d.velocity for d in last_week_data)
            prev_week_total = sum(d.velocity for d in prev_week_data)

            if prev_week_total > 0:
                week_over_week_change = round(
                    ((last_week_total - prev_week_total) / prev_week_total) * 100, 2
                )
            elif last_week_total > 0:
                week_over_week_change = 100.0  # Infinite increase represented as 100%

        return VelocityResponse(
            data=velocity_data,
            count=len(velocity_data),
            period_start=start_date,
            period_end=end_date,
            week_over_week_change=week_over_week_change,
            total_cards_analyzed=total_cards,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch velocity analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("velocity analytics retrieval", e),
        ) from e


@router.get("/analytics/top-domains")
async def get_top_domains(
    limit: int = 20,
    category: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Top domains leaderboard by composite score."""
    try:
        query = supabase.table("domain_reputation").select(
            "id,domain_pattern,organization_name,category,curated_tier,"
            "composite_score,user_quality_avg,user_rating_count,triage_pass_rate"
        )
        query = query.eq("is_active", True)
        if category:
            query = query.eq("category", category)
        query = query.order("composite_score", desc=True).limit(limit)
        result = await asyncio.to_thread(query.execute)
        return result.data
    except Exception as e:
        logger.error(f"Failed to get top domains: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("top domains retrieval", e),
        ) from e
