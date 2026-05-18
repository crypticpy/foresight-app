"""Domain reputation sub-router.

Endpoints
---------
* ``GET /domain-reputation`` — paginated, filterable list of domains
  ranked by composite score (any authed user).
* ``GET /domain-reputation/{domain_id}`` — single-domain detail
  (any authed user).
* ``POST /admin/domain-reputation`` — admin-only create; seeds
  ``composite_score`` from the curated-tier table (1 → 85, 2 → 60,
  3 → 35, otherwise 20) plus the Texas-relevance bonus.
* ``PATCH /admin/domain-reputation/{domain_id}`` — admin-only partial
  update; rejects empty payloads.
* ``DELETE /admin/domain-reputation/{domain_id}`` — admin-only delete.
* ``POST /admin/domain-reputation/recalculate`` — admin-only batch
  recomputation from user ratings + pipeline stats.

The ``top-domains`` aggregate endpoint deliberately lives in
``analytics.py`` (not here) to avoid duplicate route registration.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

Each Supabase call and the ``domain_reputation_service`` recalc are
wrapped in ``asyncio.to_thread`` because the sync postgrest client
blocks the event loop.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app import domain_reputation_service
from app.authz import require_admin
from app.deps import _safe_error, get_current_user, supabase
from app.models.domain_reputation import (
    DomainReputationCreate,
    DomainReputationUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


@router.get("/domain-reputation")
async def list_domain_reputations(
    page: int = 1,
    page_size: int = 50,
    tier: Optional[int] = None,
    category: Optional[str] = None,
    user=Depends(get_current_user),
):
    """List all domains with reputation data, paginated and filterable."""
    try:
        def _query():
            q = supabase.table("domain_reputation").select("*", count="exact")
            if tier:
                q = q.eq("curated_tier", tier)
            if category:
                q = q.eq("category", category)
            q = q.order("composite_score", desc=True)
            q = q.range((page - 1) * page_size, page * page_size - 1)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return {
            "items": result.data,
            "total": result.count,
            "page": page,
            "page_size": page_size,
        }
    except Exception as e:
        logger.error(f"Failed to list domain reputations: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputations listing", e),
        ) from e


@router.get("/domain-reputation/{domain_id}")
async def get_domain_reputation(domain_id: str, user=Depends(get_current_user)):
    """Get single domain reputation detail."""
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("domain_reputation")
            .select("*")
            .eq("id", domain_id)
            .single()
            .execute()
        )
        return result.data
    except Exception as e:
        logger.error(f"Failed to get domain reputation {domain_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_safe_error("domain reputation lookup", e),
        ) from e


@router.post("/admin/domain-reputation")
async def create_domain_reputation(
    body: DomainReputationCreate, user=Depends(get_current_user)
):
    """Add a new domain to the reputation system. Admin only."""
    require_admin(user)

    try:
        data = body.model_dump()
        # Curated-tier seeds the composite score; tiers outside 1–3 fall
        # back to a low default so the row is still useful for ranking.
        tier_scores = {1: 85, 2: 60, 3: 35}
        tier_score = tier_scores.get(data.get("curated_tier"), 20)
        data["composite_score"] = tier_score * 0.50 + data.get(
            "texas_relevance_bonus", 0
        )
        result = await asyncio.to_thread(
            lambda: supabase.table("domain_reputation").insert(data).execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create domain reputation",
            )
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create domain reputation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputation creation", e),
        ) from e


@router.patch("/admin/domain-reputation/{domain_id}")
async def update_domain_reputation(
    domain_id: str,
    body: DomainReputationUpdate,
    user=Depends(get_current_user),
):
    """Update a domain's tier, category, or other fields. Admin only."""
    require_admin(user)

    try:
        data = body.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )
        result = await asyncio.to_thread(
            lambda: supabase.table("domain_reputation")
            .update(data)
            .eq("id", domain_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Domain reputation not found",
            )
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update domain reputation {domain_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputation update", e),
        ) from e


@router.delete("/admin/domain-reputation/{domain_id}")
async def delete_domain_reputation(
    domain_id: str, user=Depends(get_current_user)
):
    """Remove a domain from the reputation system. Admin only."""
    require_admin(user)

    try:
        await asyncio.to_thread(
            lambda: supabase.table("domain_reputation")
            .delete()
            .eq("id", domain_id)
            .execute()
        )
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Failed to delete domain reputation {domain_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputation deletion", e),
        ) from e


@router.post("/admin/domain-reputation/recalculate")
async def recalculate_domain_reputations(user=Depends(get_current_user)):
    """Recalculate all composite scores from user ratings + pipeline stats."""
    require_admin(user)

    try:
        return await asyncio.to_thread(
            domain_reputation_service.recalculate_all, supabase
        )
    except Exception as e:
        logger.error(f"Failed to recalculate domain reputations: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputations recalculation", e),
        ) from e
