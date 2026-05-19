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
