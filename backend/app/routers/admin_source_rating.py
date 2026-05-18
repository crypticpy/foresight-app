"""Source rating sub-router.

Endpoints
---------
* ``POST /sources/{source_id}/rate`` — upsert the current user's
  ``quality_rating`` / ``relevance_rating`` / ``comment`` for a source
  (unique on ``(source_id, user_id)``). Triggers a parent-card SQI
  recalculation so cards re-score promptly when their evidence changes.
* ``GET /sources/{source_id}/ratings`` — return aggregated stats
  (average quality, count, relevance distribution) for a source, plus
  the current user's own rating row if they have one.
* ``DELETE /sources/{source_id}/rate`` — remove the current user's
  rating for a source.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

Each Supabase call is wrapped in ``asyncio.to_thread`` because the sync
postgrest client blocks the event loop otherwise.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app import quality_service
from app.deps import _safe_error, get_current_user, supabase
from app.models.source_rating import (
    SourceRatingAggregate,
    SourceRatingCreate,
    SourceRatingResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


@router.post("/sources/{source_id}/rate", response_model=SourceRatingResponse)
async def rate_source(
    source_id: str,
    rating: SourceRatingCreate,
    user=Depends(get_current_user),
):
    """Create or update user's rating for a source. Upserts on (source_id, user_id)."""
    try:
        data = {
            "source_id": source_id,
            "user_id": user["id"],
            "quality_rating": rating.quality_rating,
            "relevance_rating": rating.relevance_rating.value,
            "comment": rating.comment,
        }
        result = await asyncio.to_thread(
            lambda: supabase.table("source_ratings")
            .upsert(data, on_conflict="source_id,user_id")
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to save rating",
            )

        # Trigger SQI recalculation for parent card(s) of this source.
        # Fire-and-forget: rating is saved even if recalculation fails.
        try:
            card_links = await asyncio.to_thread(
                lambda: supabase.table("card_sources")
                .select("card_id")
                .eq("source_id", source_id)
                .execute()
            )
            for link in card_links.data or []:
                if card_id := link.get("card_id"):
                    try:
                        await asyncio.to_thread(
                            quality_service.calculate_sqi, supabase, card_id
                        )
                    except Exception as sqi_err:
                        logger.warning(
                            f"SQI recalc failed for card {card_id} after rating: {sqi_err}"
                        )
        except Exception as lookup_err:
            logger.warning(
                f"Failed to look up parent cards for source {source_id}: {lookup_err}"
            )

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to rate source {source_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("rating save", e),
        ) from e


@router.get("/sources/{source_id}/ratings", response_model=SourceRatingAggregate)
async def get_source_ratings(source_id: str, user=Depends(get_current_user)):
    """Get aggregated ratings for a source plus current user's rating."""
    try:
        all_ratings = await asyncio.to_thread(
            lambda: supabase.table("source_ratings")
            .select("*")
            .eq("source_id", source_id)
            .execute()
        )

        ratings = all_ratings.data or []
        if not ratings:
            return SourceRatingAggregate(
                source_id=source_id,
                avg_quality=0,
                total_ratings=0,
                relevance_distribution={
                    "high": 0,
                    "medium": 0,
                    "low": 0,
                    "not_relevant": 0,
                },
            )

        avg_quality = sum(r["quality_rating"] for r in ratings) / len(ratings)
        relevance_dist = {"high": 0, "medium": 0, "low": 0, "not_relevant": 0}
        for r in ratings:
            if r["relevance_rating"] in relevance_dist:
                relevance_dist[r["relevance_rating"]] += 1

        current_user_rating = next(
            (r for r in ratings if r["user_id"] == user["id"]), None
        )

        return SourceRatingAggregate(
            source_id=source_id,
            avg_quality=round(avg_quality, 2),
            total_ratings=len(ratings),
            relevance_distribution=relevance_dist,
            current_user_rating=current_user_rating,
        )
    except Exception as e:
        logger.error(f"Failed to get source ratings for {source_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("source ratings retrieval", e),
        ) from e


@router.delete("/sources/{source_id}/rate")
async def delete_source_rating(source_id: str, user=Depends(get_current_user)):
    """Remove user's rating for a source."""
    try:
        await asyncio.to_thread(
            lambda: supabase.table("source_ratings")
            .delete()
            .eq("source_id", source_id)
            .eq("user_id", user["id"])
            .execute()
        )
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Failed to delete source rating for {source_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("rating deletion", e),
        ) from e
