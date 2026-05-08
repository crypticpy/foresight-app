"""Models for generated card artifact indicators."""

from datetime import datetime

from pydantic import BaseModel


class CardArtifacts(BaseModel):
    has_deep_research: bool = False
    has_brief: bool = False
    has_scan: bool = False
    deep_research_updated_at: datetime | str | None = None
    brief_updated_at: datetime | str | None = None
    scan_updated_at: datetime | str | None = None
    pending_research: bool = False

