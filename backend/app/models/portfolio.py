"""Portfolio models — curated card collections for presentation export."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

PORTFOLIO_MAX_ITEMS = 15


class PortfolioItemCardSnapshot(BaseModel):
    """Lightweight card snapshot shipped with each portfolio item.

    Lets the portfolio detail UI render names, links, and pillar badges
    without a separate cards round-trip. None when the card was deleted.
    """

    id: str
    name: str
    slug: Optional[str] = None
    pillar_id: Optional[str] = None
    horizon: Optional[str] = None
    stage_id: Optional[int] = None


class PortfolioItem(BaseModel):
    id: str
    portfolio_id: str
    card_id: str
    position: int = 0
    notes: Optional[str] = None
    added_at: datetime
    card: Optional[PortfolioItemCardSnapshot] = None


class PortfolioItemCreate(BaseModel):
    card_id: str
    position: Optional[int] = None
    notes: Optional[str] = None


class PortfolioItemReorder(BaseModel):
    """Single entry in a reorder request."""

    card_id: str
    position: int


class Portfolio(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    user_id: str
    workstream_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_exported_at: Optional[datetime] = None
    item_count: int = 0


class PortfolioWithItems(Portfolio):
    items: List[PortfolioItem] = Field(default_factory=list)


class PortfolioCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=1000)
    workstream_id: Optional[str] = None
    card_ids: List[str] = Field(
        default_factory=list,
        description="Initial cards to add (max 15).",
    )


class PortfolioUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=1000)
    workstream_id: Optional[str] = None


class AddItemsRequest(BaseModel):
    card_ids: List[str] = Field(..., min_items=1)


class ReorderItemsRequest(BaseModel):
    items: List[PortfolioItemReorder]


class PortfolioExportRequest(BaseModel):
    format: str = Field(..., pattern="^(pdf|pptx)$")
