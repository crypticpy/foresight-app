"""Tags router — community folksonomy for cards.

Endpoints:
  GET    /api/v1/tags?q=<prefix>              autocomplete
  GET    /api/v1/tags/popular                 popular tags (sidebar facet)
  GET    /api/v1/tags/{slug}                  tag detail (with cards)
  GET    /api/v1/cards/{card_id}/tags         tags on a card, viewer-ordered
  POST   /api/v1/cards/{card_id}/tags         apply tag (find-or-create + insert)
  DELETE /api/v1/cards/{card_id}/tags/{slug}  remove own tag application

Authorization model:
  - Reads are open to any authenticated user (folksonomy → everyone sees).
  - Apply/remove only affects the caller's own card_tags row; calling
    DELETE for a tag you never applied is a no-op (idempotent).
  - Admin merge/rename/delete lives in routers/admin_tags.py (PR 7).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import supabase, get_current_user
from app.models.tag import (
    CardTagListResponse,
    CardTagsBatchRequest,
    CardTagsBatchResponse,
    PopularTagsResponse,
    Tag,
    TagApplyRequest,
    TagDetailCard,
    TagDetailResponse,
    TagListResponse,
    TagOnCard,
    TagWithUsage,
    TAG_BATCH_CARD_LIMIT,
)
from app.security import limiter
from fastapi import Request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["tags"])

# Autocomplete cap. The UI shows 8-10 suggestions; this is the hard upper
# bound so a poorly written client can't pull the whole tag dictionary.
_AUTOCOMPLETE_MAX = 25

# Tag detail page — cap per response. Pagination via offset.
_DETAIL_CARDS_MAX = 100


def _row_to_tag(row: dict) -> Tag:
    return Tag(
        id=row["id"],
        slug=row["slug"],
        label=row["label"],
        created_by=row.get("created_by"),
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# GET /api/v1/tags — autocomplete
# ---------------------------------------------------------------------------


@router.get("/tags", response_model=TagListResponse)
async def list_tags(
    q: Optional[str] = Query(
        None,
        description="Substring match on label (case-insensitive). Empty returns recent tags.",
    ),
    limit: int = Query(10, ge=1, le=_AUTOCOMPLETE_MAX),
    current_user: dict = Depends(get_current_user),
) -> TagListResponse:
    """Autocomplete for the tag combobox.

    With ``q``: trigram-style ILIKE match on label.
    Without ``q``: recent tags (created_at desc), so an empty combobox
    still has something useful to show.
    """
    query = supabase.table("tags").select(
        "id, slug, label, created_by, created_at"
    )
    needle = (q or "").strip()
    if needle:
        # Escape %/_ so user input can't accidentally pattern-match.
        sanitized = needle.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        query = query.ilike("label", f"%{sanitized}%")
    query = query.order("created_at", desc=True).limit(limit)

    res = await asyncio.to_thread(query.execute)
    return TagListResponse(tags=[_row_to_tag(r) for r in (res.data or [])])


# ---------------------------------------------------------------------------
# GET /api/v1/tags/popular — popular tags for sidebar / admin
# ---------------------------------------------------------------------------


@router.get("/tags/popular", response_model=PopularTagsResponse)
async def list_popular_tags(
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> PopularTagsResponse:
    """Tags ordered by distinct-card count desc."""
    res = await asyncio.to_thread(
        lambda: supabase.rpc("popular_tags", {"p_limit": limit}).execute()
    )
    rows = res.data or []
    return PopularTagsResponse(
        tags=[
            TagWithUsage(
                id=row["id"],
                slug=row["slug"],
                label=row["label"],
                created_by=row.get("created_by"),
                created_at=row["created_at"],
                application_count=row.get("application_count") or 0,
                card_count=row.get("card_count") or 0,
            )
            for row in rows
        ]
    )


# ---------------------------------------------------------------------------
# GET /api/v1/tags/{slug} — tag detail + cards (PR 5 surfaces this as a page)
# ---------------------------------------------------------------------------


_TAG_DETAIL_CARD_FIELDS = (
    "id, slug, name, summary, pillar_id, stage_id, horizon, "
    "impact_score, relevance_score, velocity_score, novelty_score, "
    "signal_quality_score, velocity_trend, trend_direction, "
    "top25_relevance, created_at, updated_at"
)


@router.get("/tags/{slug}", response_model=TagDetailResponse)
async def get_tag_detail(
    slug: str,
    limit: int = Query(20, ge=1, le=_DETAIL_CARDS_MAX),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
) -> TagDetailResponse:
    """Tag header + paginated tile rows for /tags/{slug}.

    Returns card summaries (not just IDs) so the page renders in one
    round-trip. The application_count for the tag is `total`, exposed
    so the UI can show "showing N of M" and gate `loadMore`.
    """
    tag_res = await asyncio.to_thread(
        lambda: supabase.table("tags")
        .select("id, slug, label, created_by, created_at")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    if not tag_res.data:
        raise HTTPException(status_code=404, detail="Tag not found")
    tag = tag_res.data[0]

    # Paginate over (card_id, max(created_at)) so a card that gets a fresh
    # application bubbles back up the list. `tag_cards_page` already
    # filters to active cards inside its CTE, so LIMIT/OFFSET apply
    # post-filter and a page returns up to `limit` active cards.
    distinct_res = await asyncio.to_thread(
        lambda: supabase.rpc(
            "tag_cards_page",
            {
                "p_tag_id": tag["id"],
                "p_limit": limit,
                "p_offset": offset,
            },
        ).execute()
    )
    page_rows = distinct_res.data or []
    card_ids = [row["card_id"] for row in page_rows]

    # `total` rides inline on every page row via a window function.
    # When the page is empty the RPC can't surface it, so for offset>0
    # we fall back to a dedicated count RPC to preserve the contract
    # ("total reflects the global count regardless of pagination").
    # offset=0 + empty rows is genuinely zero — skip the extra round-trip.
    if page_rows:
        total = page_rows[0]["total"]
    elif offset > 0:
        count_res = await asyncio.to_thread(
            lambda: supabase.rpc(
                "tag_cards_count", {"p_tag_id": tag["id"]}
            ).execute()
        )
        total = int(count_res.data or 0)
    else:
        total = 0

    cards: list[TagDetailCard] = []
    if card_ids:
        cards_res = await asyncio.to_thread(
            lambda: supabase.table("cards")
            .select(_TAG_DETAIL_CARD_FIELDS)
            .in_("id", card_ids)
            .execute()
        )
        # Preserve the RPC's ordering — `in_(...)` returns rows in
        # whatever order Postgres feels like, not in `card_ids` order.
        by_id = {row["id"]: row for row in (cards_res.data or [])}
        for cid in card_ids:
            row = by_id.get(cid)
            if row:
                cards.append(TagDetailCard(**row))

    return TagDetailResponse(
        tag=_row_to_tag(tag),
        cards=cards,
        total=total,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/cards/tags-batch — hydrate tag chips across a viewport
# ---------------------------------------------------------------------------


@router.post("/cards/tags-batch", response_model=CardTagsBatchResponse)
async def list_card_tags_batch(
    payload: CardTagsBatchRequest,
    current_user: dict = Depends(get_current_user),
) -> CardTagsBatchResponse:
    """Return tags for many cards in a single trip.

    Used by list views (Signals, Discover) so each card tile can render
    its mini tag badges without N round-trips. The response omits cards
    that have no tags — callers should treat absence as an empty list.

    Same ordering as ``/cards/{card_id}/tags``: the caller's own
    applications first (alphabetical), then everyone else's
    (alphabetical) within each card_id group.
    """
    if not payload.card_ids:
        return CardTagsBatchResponse(tags_by_card={})

    if len(payload.card_ids) > TAG_BATCH_CARD_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Batch size {len(payload.card_ids)} exceeds limit of "
                f"{TAG_BATCH_CARD_LIMIT}. Page the request from the client."
            ),
        )

    # Postgres receives a UUID[]; we pass strings and rely on the implicit
    # cast on the RPC signature. PostgREST serializes List[str] as a JSON
    # array which uuid[] accepts.
    card_ids = [str(cid) for cid in payload.card_ids]

    res = await asyncio.to_thread(
        lambda: supabase.rpc(
            "card_tags_batch",
            {"p_card_ids": card_ids, "p_viewer_user_id": current_user["id"]},
        ).execute()
    )

    tags_by_card: dict[str, list[TagOnCard]] = {}
    for row in res.data or []:
        card_id = row["card_id"]
        tags_by_card.setdefault(card_id, []).append(
            TagOnCard(
                id=row["id"],
                slug=row["slug"],
                label=row["label"],
                created_by=row.get("created_by"),
                created_at=row["created_at"],
                count=row.get("count") or 0,
                applied_by_me=bool(row.get("applied_by_me")),
            )
        )
    return CardTagsBatchResponse(tags_by_card=tags_by_card)


# ---------------------------------------------------------------------------
# GET /api/v1/cards/{card_id}/tags — tags on a card, viewer-ordered
# ---------------------------------------------------------------------------


@router.get("/cards/{card_id}/tags", response_model=CardTagListResponse)
async def list_card_tags(
    card_id: str,
    current_user: dict = Depends(get_current_user),
) -> CardTagListResponse:
    """Tags on a card with count + applied_by_me, viewer's first."""
    res = await asyncio.to_thread(
        lambda: supabase.rpc(
            "card_tag_summary",
            {"p_card_id": card_id, "p_viewer_user_id": current_user["id"]},
        ).execute()
    )
    rows = res.data or []
    tags = [
        TagOnCard(
            id=row["id"],
            slug=row["slug"],
            label=row["label"],
            created_by=row.get("created_by"),
            created_at=row["created_at"],
            count=row.get("count") or 0,
            applied_by_me=bool(row.get("applied_by_me")),
        )
        for row in rows
    ]
    return CardTagListResponse(tags=tags)


# ---------------------------------------------------------------------------
# POST /api/v1/cards/{card_id}/tags — apply a tag (find-or-create + insert)
# ---------------------------------------------------------------------------


@router.post("/cards/{card_id}/tags", response_model=CardTagListResponse)
@limiter.limit("60/minute")
async def apply_tag_to_card(
    request: Request,
    card_id: str,
    payload: TagApplyRequest,
    current_user: dict = Depends(get_current_user),
) -> CardTagListResponse:
    """Apply a tag to a card.

    Steps:
      1. Verify the card exists (404 if not).
      2. RPC find_or_create_tag → returns tag row, or NULL for empty label.
      3. Upsert one card_tags row owned by this user.

    Idempotent: re-applying the same tag is a no-op (ON CONFLICT DO NOTHING).
    Returns the full updated tag list for the card.
    """
    card_res = await asyncio.to_thread(
        lambda: supabase.table("cards")
        .select("id")
        .eq("id", card_id)
        .limit(1)
        .execute()
    )
    if not card_res.data:
        raise HTTPException(status_code=404, detail="Card not found")

    tag_res = await asyncio.to_thread(
        lambda: supabase.rpc(
            "find_or_create_tag",
            {"p_label": payload.label, "p_created_by": current_user["id"]},
        ).execute()
    )
    tag = tag_res.data
    if not tag:
        raise HTTPException(
            status_code=400,
            detail="Tag label cannot be empty or only punctuation",
        )

    insert_payload = {
        "card_id": card_id,
        "tag_id": tag["id"],
        "user_id": current_user["id"],
    }
    if payload.workstream_id:
        insert_payload["workstream_id"] = payload.workstream_id

    # ON CONFLICT DO NOTHING via PostgREST: ignore_duplicates=True.
    await asyncio.to_thread(
        lambda: supabase.table("card_tags")
        .upsert(insert_payload, ignore_duplicates=True)
        .execute()
    )

    return await list_card_tags(card_id=card_id, current_user=current_user)


# ---------------------------------------------------------------------------
# DELETE /api/v1/cards/{card_id}/tags/{slug} — remove own application
# ---------------------------------------------------------------------------


@router.delete("/cards/{card_id}/tags/{slug}", response_model=CardTagListResponse)
async def remove_tag_from_card(
    card_id: str,
    slug: str,
    current_user: dict = Depends(get_current_user),
) -> CardTagListResponse:
    """Remove the caller's application of ``slug`` from ``card_id``.

    Idempotent: deleting a tag you never applied returns the unchanged list.
    Does not touch other users' applications of the same tag.
    """
    tag_res = await asyncio.to_thread(
        lambda: supabase.table("tags")
        .select("id")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    if tag_res.data:
        tag_id = tag_res.data[0]["id"]
        await asyncio.to_thread(
            lambda: supabase.table("card_tags")
            .delete()
            .eq("card_id", card_id)
            .eq("tag_id", tag_id)
            .eq("user_id", current_user["id"])
            .execute()
        )

    return await list_card_tags(card_id=card_id, current_user=current_user)
