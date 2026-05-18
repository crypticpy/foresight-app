"""Card quality (SQI) sub-router.

Endpoints
---------
* ``GET /cards/{card_id}/quality`` — return the cached SQI breakdown for
  a card, falling back to an inline recalculation if no breakdown exists.
* ``POST /cards/{card_id}/quality/recalculate`` — admin-only force
  recalculation (rate-limited to 20/min so a slip can't pin the DB).
* ``POST /admin/quality/recalculate-all`` — admin-only batch
  recalculation across every card.
* ``GET /cards/{card_id}/quality-score`` — return the standalone signal
  quality score (cheaper / different formula than full SQI).
* ``POST /cards/{card_id}/quality-score/refresh`` — admin-only recompute
  + persist the signal quality score.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

``quality_service`` and ``signal_quality`` issue blocking sync postgrest
calls; every invocation is offloaded with ``asyncio.to_thread`` so the
async event loop stays free.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app import quality_service
from app.authz import require_admin
from app.deps import _safe_error, get_current_user, limiter, supabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


@router.get("/cards/{card_id}/quality")
async def get_card_quality(card_id: str, user=Depends(get_current_user)):
    """Get full SQI breakdown for a card."""
    try:
        breakdown = await asyncio.to_thread(
            quality_service.get_breakdown, supabase, card_id
        )
        if not breakdown:
            breakdown = await asyncio.to_thread(
                quality_service.calculate_sqi, supabase, card_id
            )
        return breakdown
    except Exception as e:
        logger.error(f"Failed to get quality for card {card_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("card quality retrieval", e),
        ) from e


@router.post("/cards/{card_id}/quality/recalculate")
@limiter.limit("20/minute")
async def recalculate_card_quality(
    request: Request, card_id: str, user=Depends(get_current_user)
):
    """Force SQI recalculation for a card."""
    require_admin(user)

    try:
        return await asyncio.to_thread(
            quality_service.calculate_sqi, supabase, card_id
        )
    except Exception as e:
        logger.error(f"Failed to recalculate quality for card {card_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("card quality recalculation", e),
        ) from e


@router.post("/admin/quality/recalculate-all")
async def recalculate_all_quality(user=Depends(get_current_user)):
    """Batch recalculate SQI for all cards. Admin only."""
    require_admin(user)

    try:
        return await asyncio.to_thread(
            quality_service.recalculate_all_cards, supabase
        )
    except Exception as e:
        logger.error(f"Failed to batch recalculate quality: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("batch quality recalculation", e),
        ) from e


@router.get("/cards/{card_id}/quality-score")
async def get_signal_quality_score(card_id: str, user=Depends(get_current_user)):
    """Get computed signal quality score for a card."""
    from app.signal_quality import compute_signal_quality_score

    return await asyncio.to_thread(compute_signal_quality_score, supabase, card_id)


@router.post("/cards/{card_id}/quality-score/refresh")
async def refresh_signal_quality_score(
    card_id: str, user=Depends(get_current_user)
):
    """Recompute and store the signal quality score."""
    require_admin(user)

    from app.signal_quality import update_signal_quality_score

    score = await asyncio.to_thread(update_signal_quality_score, supabase, card_id)
    return {"card_id": card_id, "signal_quality_score": score}
