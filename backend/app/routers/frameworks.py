"""Strategic frameworks router.

Read-only endpoints for the framework taxonomy introduced by the FY26
reactivation.  See ``docs/11_PRD_Scoped_Workstreams_and_Frameworks.md`` for
the data model.

- ``GET /api/v1/frameworks`` returns the list of frameworks (lightweight).
- ``GET /api/v1/frameworks/{code}`` returns one framework with nested
  categories and drivers.
"""

from __future__ import annotations

import logging
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user, supabase
from app.models.frameworks import (
    Driver,
    FrameworkCategory,
    StrategicFramework,
    StrategicFrameworkSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/frameworks", tags=["frameworks"])


@router.get("", response_model=List[StrategicFrameworkSummary])
async def list_frameworks(_: dict = Depends(get_current_user)):
    """List all strategic frameworks (without nested categories/drivers)."""
    response = (
        supabase.table("strategic_frameworks")
        .select("id, code, name, description, owner_type, display_order")
        .order("display_order", desc=False)
        .order("code", desc=False)
        .execute()
    )
    return [StrategicFrameworkSummary(**row) for row in (response.data or [])]


@router.get("/{code}", response_model=StrategicFramework)
async def get_framework(code: str, _: dict = Depends(get_current_user)):
    """Return one framework with categories and drivers nested."""
    fw_resp = (
        supabase.table("strategic_frameworks")
        .select("*")
        .eq("code", code)
        .limit(1)
        .execute()
    )
    if not fw_resp.data:
        raise HTTPException(status_code=404, detail=f"Framework '{code}' not found")
    framework_row = fw_resp.data[0]

    cat_resp = (
        supabase.table("framework_categories")
        .select("*")
        .eq("framework_code", code)
        .order("display_order", desc=False)
        .order("code", desc=False)
        .execute()
    )
    category_rows = cat_resp.data or []
    category_ids = [row["id"] for row in category_rows]

    drivers_by_category: Dict[str, List[Driver]] = {cid: [] for cid in category_ids}
    if category_ids:
        drv_resp = (
            supabase.table("drivers")
            .select("*")
            .in_("framework_category_id", category_ids)
            .order("display_order", desc=False)
            .order("code", desc=False)
            .execute()
        )
        for drv_row in drv_resp.data or []:
            drivers_by_category.setdefault(
                drv_row["framework_category_id"], []
            ).append(Driver(**drv_row))

    categories: List[FrameworkCategory] = []
    for cat_row in category_rows:
        category_drivers = drivers_by_category.get(cat_row["id"], [])
        categories.append(
            FrameworkCategory(**{**cat_row, "drivers": category_drivers})
        )

    return StrategicFramework(**{**framework_row, "categories": categories})
