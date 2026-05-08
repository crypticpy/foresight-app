"""Lens architecture router — taxonomy reads + user-metadata writes.

See ``docs/18_FEATURE_Lens_Architecture.md``. Endpoints:

- ``GET  /api/v1/lens/strategic-anchors``  — six anchors (cached config)
- ``GET  /api/v1/lens/csp-taxonomy``       — CSP goals + measures hierarchy
- ``PATCH /api/v1/cards/{card_id}/user-metadata`` — partial-merge user edits
   onto the sacred ``cards.user_metadata`` JSONB. Re-classification never
   overwrites this layer.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.authz import require_card_research_access, require_paid_user
from app.deps import _safe_error, get_current_user, supabase
from app.models.lens import (
    USER_METADATA_ARRAY_KEYS,
    USER_METADATA_OVERRIDE_KEYS,
    UserMetadata,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["lens"])


# ============================================================================
# Taxonomy reads
# ============================================================================


class StrategicAnchor(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    display_order: int = 0


class CspMeasure(BaseModel):
    id: str
    code: str
    name: str
    initial_target: Optional[str] = None
    target_year: Optional[int] = None
    display_order: int = 0


class CspGoal(BaseModel):
    id: str
    pillar_code: str
    code: str
    name: str
    description: Optional[str] = None
    display_order: int = 0
    measures: List[CspMeasure] = Field(default_factory=list)


@router.get("/lens/strategic-anchors", response_model=List[StrategicAnchor])
async def get_strategic_anchors(current_user: dict = Depends(get_current_user)):
    """Return the six strategic anchors in display order."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("strategic_anchors")
            .select("code, name, description, display_order")
            .order("display_order")
            .execute()
        )
    except Exception as exc:
        logger.exception("Strategic anchors lookup failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("strategic anchors lookup", exc),
        ) from exc

    return [StrategicAnchor(**row) for row in (resp.data or [])]


@router.get("/lens/csp-taxonomy", response_model=List[CspGoal])
async def get_csp_taxonomy(current_user: dict = Depends(get_current_user)):
    """Return the full CSP goals + measures hierarchy nested by goal."""
    try:
        goals_resp, measures_resp = await asyncio.gather(
            asyncio.to_thread(
                lambda: supabase.table("csp_goals")
                .select("id, pillar_code, code, name, description, display_order")
                .order("pillar_code")
                .order("display_order")
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("csp_measures")
                .select(
                    "id, goal_id, code, name, initial_target, target_year, display_order"
                )
                .order("display_order")
                .execute()
            ),
        )
    except Exception as exc:
        logger.exception("CSP taxonomy lookup failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("csp taxonomy lookup", exc),
        ) from exc

    goals = goals_resp.data or []
    measures = measures_resp.data or []

    by_goal: Dict[str, List[Dict[str, Any]]] = {}
    for measure in measures:
        by_goal.setdefault(measure["goal_id"], []).append(measure)

    return [
        CspGoal(
            id=goal["id"],
            pillar_code=goal["pillar_code"],
            code=goal["code"],
            name=goal["name"],
            description=goal.get("description"),
            display_order=goal.get("display_order", 0),
            measures=[
                CspMeasure(
                    id=m["id"],
                    code=m["code"],
                    name=m["name"],
                    initial_target=m.get("initial_target"),
                    target_year=m.get("target_year"),
                    display_order=m.get("display_order", 0),
                )
                for m in by_goal.get(goal["id"], [])
            ],
        )
        for goal in goals
    ]


# ============================================================================
# User-metadata mutation
# ============================================================================


class UserMetadataPatch(BaseModel):
    """Partial-merge body for ``PATCH /cards/{id}/user-metadata``.

    Each top-level key, when present, fully replaces that bucket on the
    server-side ``user_metadata`` blob. Buckets not present are left alone.
    Pass an empty dict (``{"added": {}}``) to clear a bucket.

    Inner keys are restricted to the closed vocabulary documented on
    ``UserMetadata`` so a malicious or buggy client can't pollute the
    JSONB blob with unknown fields or use ``removed[any_field]`` to
    hide LLM-derived values from other readers.
    """

    model_config = ConfigDict(extra="forbid")

    overrides: Optional[Dict[str, Any]] = None
    added: Optional[Dict[str, List[str]]] = None
    removed: Optional[Dict[str, List[str]]] = None

    @field_validator("overrides")
    @classmethod
    def _patch_override_keys(
        cls, value: Optional[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        if value is None:
            return value
        bad = sorted(k for k in value if k not in USER_METADATA_OVERRIDE_KEYS)
        if bad:
            raise ValueError(
                f"Unsupported override key(s): {bad}. "
                f"Allowed: {sorted(USER_METADATA_OVERRIDE_KEYS)}"
            )
        return value

    @field_validator("added", "removed")
    @classmethod
    def _patch_array_keys(
        cls, value: Optional[Dict[str, List[str]]]
    ) -> Optional[Dict[str, List[str]]]:
        if value is None:
            return value
        bad = sorted(k for k in value if k not in USER_METADATA_ARRAY_KEYS)
        if bad:
            raise ValueError(
                f"Unsupported array-overlay key(s): {bad}. "
                f"Allowed: {sorted(USER_METADATA_ARRAY_KEYS)}"
            )
        return value


@router.patch("/cards/{card_id}/user-metadata", response_model=UserMetadata)
async def patch_card_user_metadata(
    card_id: str,
    body: UserMetadataPatch,
    current_user: dict = Depends(get_current_user),
) -> UserMetadata:
    """Merge a partial user-metadata patch into ``cards.user_metadata``.

    Only paid accounts with edit access to this card can write. Both
    "card does not exist" and "user cannot access this card" return 404
    so card existence isn't leaked to non-members. The classifier cascade
    never touches this column, so edits here are durable across
    re-classification.
    """
    require_paid_user(current_user)

    # Authz before any card-specific lookup so we don't leak existence.
    # Note: require_card_research_access raises 403 for "card exists but no
    # access" — convert to 404 here per project convention.
    try:
        await asyncio.to_thread(
            require_card_research_access, supabase, card_id, current_user
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(status_code=404, detail="Card not found") from exc
        raise

    try:
        existing_resp = await asyncio.to_thread(
            lambda: supabase.table("cards")
            .select("id, user_metadata")
            .eq("id", card_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.exception("Card lookup failed for %s: %s", card_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("card lookup", exc),
        ) from exc

    rows = existing_resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Card not found")

    raw_existing = rows[0].get("user_metadata") or {}
    try:
        current = UserMetadata(**raw_existing)
    except Exception:
        # Tolerate stale rows that pre-date the lens schema.
        current = UserMetadata.empty()

    if body.overrides is not None:
        current = current.model_copy(update={"overrides": body.overrides})
    if body.added is not None:
        current = current.model_copy(update={"added": body.added})
    if body.removed is not None:
        current = current.model_copy(update={"removed": body.removed})

    # Re-validate the merged shape (catches bad value types in overrides).
    merged = UserMetadata(**current.model_dump())

    try:
        await asyncio.to_thread(
            lambda: supabase.table("cards")
            .update({"user_metadata": merged.model_dump()})
            .eq("id", card_id)
            .execute()
        )
    except Exception as exc:
        logger.exception("user_metadata write failed for card %s: %s", card_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("user_metadata write", exc),
        ) from exc

    return merged
