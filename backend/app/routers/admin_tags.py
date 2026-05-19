"""Admin tag management — merge, rename, delete (PR 7).

These endpoints curate the global tag dictionary built up by community
applications. They live in a separate file from `routers/tags.py` because
they have a fundamentally different authorization model: every mutation
requires admin role, and they operate on the shared dictionary rather
than the caller's own applications.

Endpoints:
  POST   /api/v1/admin/tags/{source_slug}/merge   merge source → target
  PATCH  /api/v1/admin/tags/{slug}                rename (label + slug)
  DELETE /api/v1/admin/tags/{slug}                delete (cascades to card_tags)

All three require `require_admin` and run through the service-role
Supabase client so RLS doesn't block the dictionary mutation.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.authz import require_admin
from app.deps import supabase, get_current_user
from app.models.tag import (
    AdminTagMergeRequest,
    AdminTagMergeResponse,
    AdminTagRenameRequest,
    Tag,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["admin-tags"])


def _row_to_tag(row: dict) -> Tag:
    return Tag(
        id=row["id"],
        slug=row["slug"],
        label=row["label"],
        created_by=row.get("created_by"),
        created_at=row["created_at"],
    )


def _fetch_tag_by_slug(slug: str) -> dict | None:
    """Synchronous helper for use inside ``asyncio.to_thread`` blocks."""
    res = (
        supabase.table("tags")
        .select("id, slug, label, created_by, created_at")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


# ---------------------------------------------------------------------------
# POST /api/v1/admin/tags/{source_slug}/merge
# ---------------------------------------------------------------------------


@router.post(
    "/admin/tags/{source_slug}/merge",
    response_model=AdminTagMergeResponse,
)
async def merge_tag(
    source_slug: str,
    body: AdminTagMergeRequest,
    user=Depends(get_current_user),
) -> AdminTagMergeResponse:
    """Merge `source_slug` into `target_slug`.

    Re-points every `card_tags` row off the source onto the target and
    deletes the source tag. The target must already exist. Runs through
    the ``admin_merge_tags`` RPC so the re-pointing + delete happen in a
    single transaction.
    """
    require_admin(user)
    target_slug = body.target_slug.strip().lower()
    if not target_slug or target_slug == source_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="source and target slugs must differ",
        )

    source, target = await asyncio.gather(
        asyncio.to_thread(_fetch_tag_by_slug, source_slug),
        asyncio.to_thread(_fetch_tag_by_slug, target_slug),
    )
    if not source:
        raise HTTPException(status_code=404, detail="Source tag not found")
    if not target:
        raise HTTPException(status_code=404, detail="Target tag not found")

    try:
        result = await asyncio.to_thread(
            lambda: supabase.rpc(
                "admin_merge_tags",
                {
                    "p_source_tag_id": source["id"],
                    "p_target_tag_id": target["id"],
                },
            ).execute()
        )
    except Exception as exc:  # pragma: no cover — defensive
        logger.exception("admin_merge_tags RPC failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Merge failed: {exc}",
        ) from exc

    moved = 0
    deduped = 0
    if result.data:
        row = result.data[0]
        moved = int(row.get("moved_count") or 0)
        deduped = int(row.get("deduped_count") or 0)

    logger.info(
        "admin_merge_tags: %s → %s (moved=%d, deduped=%d, by=%s)",
        source_slug,
        target_slug,
        moved,
        deduped,
        user.get("id"),
    )
    return AdminTagMergeResponse(
        target=_row_to_tag(target),
        moved_count=moved,
        deduped_count=deduped,
    )


# ---------------------------------------------------------------------------
# PATCH /api/v1/admin/tags/{slug}
# ---------------------------------------------------------------------------


@router.patch("/admin/tags/{slug}", response_model=Tag)
async def rename_tag(
    slug: str,
    body: AdminTagRenameRequest,
    user=Depends(get_current_user),
) -> Tag:
    """Rename a tag's label and re-slug it.

    The new slug is computed via the SQL ``normalize_tag_slug`` helper so
    label and slug stay in lock-step with the same normalization the
    frontend applies before autocomplete lookups. Collisions return 409 —
    the admin should call ``/merge`` first if consolidation is intended.
    """
    require_admin(user)

    existing = await asyncio.to_thread(_fetch_tag_by_slug, slug)
    if not existing:
        raise HTTPException(status_code=404, detail="Tag not found")

    new_label = body.label.strip()
    if not new_label:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="label must not be blank",
        )

    # Compute the new slug via the SQL helper so frontend + backend stay in
    # lock-step on the normalization rules.
    slug_res = await asyncio.to_thread(
        lambda: supabase.rpc("normalize_tag_slug", {"input": new_label}).execute()
    )
    new_slug = (slug_res.data or "").strip() if isinstance(slug_res.data, str) else ""
    # supabase-py wraps scalar RPC results in a list-of-one in some
    # versions; handle both shapes defensively.
    if not new_slug and isinstance(slug_res.data, list) and slug_res.data:
        first = slug_res.data[0]
        if isinstance(first, str):
            new_slug = first.strip()
        elif isinstance(first, dict):
            new_slug = str(
                first.get("normalize_tag_slug") or first.get("input") or ""
            ).strip()
    if not new_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="label normalized to empty slug",
        )

    if new_slug != slug:
        collision = await asyncio.to_thread(_fetch_tag_by_slug, new_slug)
        if collision:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"A tag with slug '{new_slug}' already exists — "
                    "merge instead of rename"
                ),
            )

    updated = await asyncio.to_thread(
        lambda: supabase.table("tags")
        .update({"label": new_label, "slug": new_slug})
        .eq("id", existing["id"])
        .execute()
    )
    if not updated.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Rename failed",
        )

    logger.info(
        "admin rename_tag: %s → %s (label='%s', by=%s)",
        slug,
        new_slug,
        new_label,
        user.get("id"),
    )
    return _row_to_tag(updated.data[0])


# ---------------------------------------------------------------------------
# DELETE /api/v1/admin/tags/{slug}
# ---------------------------------------------------------------------------


@router.delete("/admin/tags/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    slug: str,
    user=Depends(get_current_user),
) -> None:
    """Delete a tag and cascade-remove all card_tags applications.

    The ``card_tags.tag_id`` foreign key is ``ON DELETE CASCADE``, so a
    single DELETE on ``tags`` is enough to scrub the dictionary entry
    and every junction row pointing at it.
    """
    require_admin(user)

    existing = await asyncio.to_thread(_fetch_tag_by_slug, slug)
    if not existing:
        raise HTTPException(status_code=404, detail="Tag not found")

    await asyncio.to_thread(
        lambda: supabase.table("tags").delete().eq("id", existing["id"]).execute()
    )
    logger.info("admin delete_tag: %s (id=%s, by=%s)", slug, existing["id"], user.get("id"))
