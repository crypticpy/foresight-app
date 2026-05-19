"""Tag models — community folksonomy for cards.

A `tag` is a global label (one row per unique slug). A `card_tag` is one
user's application of a tag to a card. The chip count on a card is the
distinct number of user rows for that (card, tag) — clicking an existing
chip inserts another row so the count reflects social proof.

Display rule: a viewer always sees their own tag applications first
(alphabetical), then everyone else's (alphabetical), capped at 10 visible
on the frontend. The backend always returns the full ordered list.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

# Frontend display cap (informational — backend returns all tags ordered).
TAG_DISPLAY_LIMIT = 10

# Reasonable max label length — anything longer is usually a copy-paste mistake.
TAG_LABEL_MAX = 60

# Max card IDs accepted by the batch endpoint per request. Matches the
# convention used by other batch endpoints in card_subresources.py.
TAG_BATCH_CARD_LIMIT = 250

# Mini-view: how many tag chips render under a card tile before collapsing
# to a "+N" affordance. Smaller than TAG_DISPLAY_LIMIT because tiles have
# far less horizontal real estate than the detail panel.
TAG_MINI_DISPLAY_LIMIT = 3


class Tag(BaseModel):
    id: str
    slug: str
    label: str
    created_by: Optional[str] = None
    created_at: datetime


class TagOnCard(Tag):
    """Tag annotated with per-card stats for the card detail UI."""

    count: int = 0
    applied_by_me: bool = False


class TagWithUsage(Tag):
    """Tag annotated with global usage stats for popular lists + admin."""

    application_count: int = 0
    card_count: int = 0


class TagApplyRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=TAG_LABEL_MAX)
    workstream_id: Optional[str] = None


class CardTagListResponse(BaseModel):
    tags: List[TagOnCard]


class TagListResponse(BaseModel):
    tags: List[Tag]


class PopularTagsResponse(BaseModel):
    tags: List[TagWithUsage]


class CardTagsBatchRequest(BaseModel):
    """Body for the batch-tags endpoint used by list views."""

    card_ids: List[UUID]


class CardTagsBatchResponse(BaseModel):
    """Map of card_id (UUID as str) → ordered list of tags on that card.

    Cards with no tags are omitted (caller treats missing as empty list)
    so the payload stays minimal when most tiles are untagged.
    """

    tags_by_card: Dict[str, List[TagOnCard]]


class TagDetailCard(BaseModel):
    """Card summary returned inline by GET /tags/{slug}.

    Mirrors the `BaseCard` shape on the frontend so the tag detail page
    can render tiles without a follow-up hydration round-trip. Personal
    relationship fields (pinned/followed) are deliberately omitted — the
    tag page is a global view, and per-viewer state would force the
    endpoint to do an extra join per request.
    """

    id: str
    slug: str
    name: str
    summary: Optional[str] = None
    pillar_id: Optional[str] = None
    stage_id: Optional[str] = None
    horizon: Optional[str] = None
    impact_score: Optional[float] = None
    relevance_score: Optional[float] = None
    velocity_score: Optional[float] = None
    novelty_score: Optional[float] = None
    signal_quality_score: Optional[float] = None
    velocity_trend: Optional[str] = None
    trend_direction: Optional[str] = None
    top25_relevance: Optional[List[str]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class TagDetailResponse(BaseModel):
    """Tag header + paginated card tiles for /tags/{slug}.

    `cards` is empty when the page sits past the end of the result set;
    `total` is the unfiltered count across all offsets so the UI can
    show "showing N of M" and decide when to stop calling loadMore.
    """

    tag: Tag
    cards: List[TagDetailCard]
    total: int


# ---------------------------------------------------------------------------
# Admin operations (PR 7) — merge / rename / delete.
# ---------------------------------------------------------------------------


class AdminTagMergeRequest(BaseModel):
    """Body for `POST /admin/tags/{source_slug}/merge`.

    The target tag must already exist — admins should rename first if they
    want a brand-new label as the merge target. Keeping merge "join only"
    makes the operation auditable: every merge is a deliberate dictionary
    consolidation, not an accidental new-tag creation.
    """

    target_slug: str = Field(..., min_length=1, max_length=TAG_LABEL_MAX)


class AdminTagMergeResponse(BaseModel):
    """Summary of a merge operation."""

    target: Tag
    moved_count: int
    deduped_count: int


class AdminTagRenameRequest(BaseModel):
    """Body for `PATCH /admin/tags/{slug}`.

    The slug is recomputed from the new label via `normalize_tag_slug`.
    Renaming to a label whose slug already exists returns 409 — the admin
    should `POST .../merge` instead so the consolidation is explicit.
    """

    label: str = Field(..., min_length=1, max_length=TAG_LABEL_MAX)
