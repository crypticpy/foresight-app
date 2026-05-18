"""Taxonomy sub-router.

Endpoints
---------
* ``GET /taxonomy`` — read-only fetch of the pillar / goal / anchor /
  stage rows used by the frontend taxonomy selectors. Returns four
  parallel lists in a single response so the UI can populate every
  dropdown in one round-trip.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

The endpoint is auth'd but **not** admin-gated — every signed-in user
needs the taxonomy to render the app. Living in the admin router is
historical (the SQL tables are admin-curated) rather than authz-driven.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends

from app.deps import get_current_user, supabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


@router.get("/taxonomy")
async def get_taxonomy(user=Depends(get_current_user)):
    """Get all taxonomy data."""
    pillars, goals, anchors, stages = await asyncio.gather(
        asyncio.to_thread(
            lambda: supabase.table("pillars").select("*").order("name").execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("goals")
            .select("*")
            .order("pillar_id", "sort_order")
            .execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("anchors").select("*").order("name").execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("stages").select("*").order("sort_order").execute()
        ),
    )

    return {
        "pillars": pillars.data,
        "goals": goals.data,
        "anchors": anchors.data,
        "stages": stages.data,
    }
