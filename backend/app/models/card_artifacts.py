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
    # In-flight / failed state for the two artifacts a user can re-trigger
    # from the kanban card. Scan failures are workstream-level (not per-card)
    # so they are not surfaced here.
    pending_research: bool = False
    pending_brief: bool = False
    failed_research: bool = False
    failed_brief: bool = False
    research_error_message: str | None = None
    brief_error_message: str | None = None
