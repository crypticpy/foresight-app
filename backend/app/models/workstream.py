"""Workstream models for Foresight API.

Models for workstream management, kanban board cards, notes,
scan operations, filter previews, and research status tracking.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator


class Workstream(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    pillar_ids: Optional[List[str]] = []
    goal_ids: Optional[List[str]] = []
    stage_ids: Optional[List[str]] = []
    horizon: Optional[str] = None
    keywords: Optional[List[str]] = []
    is_active: bool = True
    auto_add: bool = False
    auto_scan: bool = False
    # FY26 framework / scoping fields (see docs/11_PRD_Scoped_Workstreams_and_Frameworks.md)
    framework_code: Optional[str] = None
    framework_category_id: Optional[str] = None
    driver_ids: List[str] = Field(default_factory=list)
    top25_priority_ids: List[str] = Field(default_factory=list)
    budget_relevance: List[str] = Field(default_factory=list)
    purpose_statement: Optional[str] = None
    owner_type: str = "user"
    cloned_from_id: Optional[str] = None
    role: Optional[str] = None
    created_at: datetime


class WorkstreamCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Workstream name")
    description: Optional[str] = Field(
        None, max_length=1000, description="Workstream description"
    )
    pillar_ids: Optional[List[str]] = Field(
        default=[], description="Filter by pillar IDs"
    )
    goal_ids: Optional[List[str]] = Field(default=[], description="Filter by goal IDs")
    stage_ids: Optional[List[str]] = Field(
        default=[], description="Filter by stage IDs"
    )
    horizon: Optional[str] = Field(
        "ALL", pattern=r"^(H[123]|ALL)$", description="Horizon filter"
    )
    keywords: Optional[List[str]] = Field(
        default=[], max_items=20, description="Search keywords"
    )
    auto_add: bool = False
    auto_scan: bool = Field(
        default=False,
        description="Enable automatic background source scanning for this workstream",
    )
    # FY26 framework / scoping fields
    framework_code: Optional[str] = Field(
        default=None,
        description="Strategic framework code this workstream belongs to (e.g. 'PPP').",
    )
    framework_category_id: Optional[str] = Field(
        default=None,
        description="Framework category UUID (e.g. People/Place/Partnerships under PPP).",
    )
    driver_ids: List[str] = Field(
        default_factory=list,
        description="Driver UUIDs from the selected framework category.",
    )
    top25_priority_ids: List[str] = Field(
        default_factory=list,
        description="Top-25 CMO priority UUIDs this workstream advances.",
    )
    budget_relevance: List[str] = Field(
        default_factory=list,
        description="Free-text bullets connecting this workstream to budget lines.",
    )
    purpose_statement: Optional[str] = Field(
        default=None,
        max_length=4000,
        description="Markdown-friendly purpose statement shown on the workstream header.",
    )

    @validator("name")
    def name_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Name cannot be empty or whitespace")
        return v.strip()

    @validator("keywords")
    def keywords_must_be_valid(cls, v):
        if v:
            # Clean and deduplicate keywords
            cleaned = list({kw.strip().lower() for kw in v if kw and kw.strip()})
            return cleaned[:20]  # Max 20 keywords
        return []


class WorkstreamUpdate(BaseModel):
    """Partial update model for workstreams - all fields optional"""

    name: Optional[str] = None
    description: Optional[str] = None
    pillar_ids: Optional[List[str]] = None
    goal_ids: Optional[List[str]] = None
    stage_ids: Optional[List[str]] = None
    horizon: Optional[str] = None
    keywords: Optional[List[str]] = None
    is_active: Optional[bool] = None
    auto_add: Optional[bool] = None
    auto_scan: Optional[bool] = None
    # FY26 framework / scoping fields
    framework_code: Optional[str] = None
    framework_category_id: Optional[str] = None
    driver_ids: Optional[List[str]] = None
    top25_priority_ids: Optional[List[str]] = None
    budget_relevance: Optional[List[str]] = None
    purpose_statement: Optional[str] = None


class WorkstreamCreateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    pillar_ids: Optional[List[str]] = []
    goal_ids: Optional[List[str]] = []
    stage_ids: Optional[List[str]] = []
    horizon: Optional[str] = "ALL"
    keywords: Optional[List[str]] = []
    is_active: bool = True
    auto_scan: bool = False
    auto_add: bool = False
    framework_code: Optional[str] = None
    framework_category_id: Optional[str] = None
    driver_ids: List[str] = Field(default_factory=list)
    top25_priority_ids: List[str] = Field(default_factory=list)
    budget_relevance: List[str] = Field(default_factory=list)
    purpose_statement: Optional[str] = None
    owner_type: str = "user"
    auto_populated_count: int = 0
    scan_queued: bool = False


# ============================================================================
# Workstream Kanban Card Models
# ============================================================================

# Valid status values for workstream cards (Kanban columns).
# v2: collapsed from 6 stages (inbox/screening/research/brief/watching/archived)
# to 4. See docs/16_PRD_Kanban_Redesign_and_Sharing.md.
VALID_WORKSTREAM_CARD_STATUSES = {
    "inbox",
    "working",
    "ready",
    "archived",
}

VALID_BRIEF_STATUSES = {"none", "draft", "ready", "exported"}
VALID_RESEARCH_DEPTHS = {"none", "quick", "deep"}


class WorkstreamCardBase(BaseModel):
    """Base model for workstream card data."""

    id: str
    workstream_id: str
    card_id: str
    added_by: str
    added_at: datetime
    status: str = "inbox"
    position: int = 0
    notes: Optional[str] = None
    reminder_at: Optional[datetime] = None
    added_from: str = "manual"
    updated_at: Optional[datetime] = None
    # v2 card attributes (orthogonal to stage)
    is_watching: bool = False
    brief_status: str = "none"
    last_research_depth: str = "none"
    last_research_at: Optional[datetime] = None
    previous_status: Optional[str] = None


class WorkstreamCardWithDetails(BaseModel):
    """Workstream card with full card details for display."""

    id: str
    workstream_id: str
    card_id: str
    added_by: str
    added_at: datetime
    status: str
    position: int
    notes: Optional[str] = None
    reminder_at: Optional[datetime] = None
    added_from: str
    updated_at: Optional[datetime] = None
    # v2 card attributes
    is_watching: bool = False
    brief_status: str = "none"
    last_research_depth: str = "none"
    last_research_at: Optional[datetime] = None
    previous_status: Optional[str] = None
    # Card details
    card: Optional[Dict[str, Any]] = None


class WorkstreamCardCreate(BaseModel):
    """Request model for adding a card to a workstream."""

    card_id: str = Field(..., description="UUID of the card to add")
    status: Optional[str] = Field("inbox", description="Initial status (column)")
    notes: Optional[str] = Field(None, max_length=5000, description="Optional notes")

    @validator("card_id")
    def validate_card_id_format(cls, v):
        """Validate UUID format for card_id."""
        import re

        uuid_pattern = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            re.IGNORECASE,
        )
        if not uuid_pattern.match(v):
            raise ValueError("Invalid UUID format for card_id")
        return v

    @validator("status")
    def validate_status(cls, v):
        """Validate status is a valid Kanban column."""
        if v and v not in VALID_WORKSTREAM_CARD_STATUSES:
            raise ValueError(
                f"Invalid status. Must be one of: {', '.join(sorted(VALID_WORKSTREAM_CARD_STATUSES))}"
            )
        return v or "inbox"


class WorkstreamCardUpdate(BaseModel):
    """Request model for updating a workstream card."""

    status: Optional[str] = Field(None, description="New status (column)")
    position: Optional[int] = Field(None, ge=0, description="New position in column")
    notes: Optional[str] = Field(None, max_length=5000, description="Card notes")
    reminder_at: Optional[str] = Field(
        None, description="Reminder timestamp (ISO format)"
    )
    is_watching: Optional[bool] = Field(
        None, description="Toggle watch flag (notify on updates)."
    )
    brief_status: Optional[str] = Field(
        None, description="Brief artifact state."
    )

    @validator("status")
    def validate_status(cls, v):
        """Validate status is a valid Kanban column."""
        if v and v not in VALID_WORKSTREAM_CARD_STATUSES:
            raise ValueError(
                f"Invalid status. Must be one of: {', '.join(sorted(VALID_WORKSTREAM_CARD_STATUSES))}"
            )
        return v

    @validator("brief_status")
    def validate_brief_status(cls, v):
        if v and v not in VALID_BRIEF_STATUSES:
            raise ValueError(
                f"Invalid brief_status. Must be one of: {', '.join(sorted(VALID_BRIEF_STATUSES))}"
            )
        return v


class WorkstreamCardWatchingUpdate(BaseModel):
    """Request body for toggling the watch flag on a workstream card."""

    is_watching: bool = Field(..., description="New watch flag value.")


class BulkCardActionRequest(BaseModel):
    """Bulk action over a set of workstream cards.

    See docs/16_PRD_Kanban_Redesign_and_Sharing.md "Selection-driven bulk
    actions" for the supported action vocabulary.
    """

    action: str = Field(
        ...,
        description=(
            "One of: archive, restore, watch, unwatch, set_status, "
            "rerun_research, generate_portfolio, generate_combined_memo, "
            "email_selection, copy_share_links, export_raw"
        ),
    )
    card_ids: List[str] = Field(
        ..., description="Workstream-card junction IDs to act on."
    )
    params: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Action-specific parameters (e.g. depth='quick' for rerun_research, status='working' for set_status).",
    )

    @validator("card_ids")
    def card_ids_nonempty(cls, v):
        if not v:
            raise ValueError("card_ids must contain at least one id")
        if len(v) > 200:
            raise ValueError("Bulk actions are capped at 200 cards per request")
        return v


class SharePayloadResponse(BaseModel):
    """Email-friendly share payload rendered server-side."""

    subject: str
    body: str
    url: str


class WorkstreamCardsGroupedResponse(BaseModel):
    """Response model for cards grouped by status (Kanban view).

    v2: four stages — inbox / working / ready / archived. Watching is no
    longer a column; clients filter `is_watching` independently.

    Per-column lists are capped at the requested ``limit`` (default 50). The
    ``has_more`` map exposes which columns still have additional rows the
    client can fetch via the per-status load-more endpoint.
    """

    inbox: List[WorkstreamCardWithDetails] = []
    working: List[WorkstreamCardWithDetails] = []
    ready: List[WorkstreamCardWithDetails] = []
    archived: List[WorkstreamCardWithDetails] = []
    has_more: Dict[str, bool] = Field(
        default_factory=lambda: {
            "inbox": False,
            "working": False,
            "ready": False,
            "archived": False,
        }
    )


class WorkstreamCardsColumnPage(BaseModel):
    """Paginated load-more response for a single kanban column."""

    status: str
    cards: List[WorkstreamCardWithDetails] = []
    has_more: bool = False
    next_offset: int = 0


class AutoPopulateResponse(BaseModel):
    """Response model for auto-populate results."""

    added: int = Field(..., description="Number of cards added")
    cards: List[WorkstreamCardWithDetails] = Field(
        default=[], description="Cards that were added"
    )


class Note(BaseModel):
    id: str
    content: str
    is_private: bool = False
    created_at: datetime


class NoteCreate(BaseModel):
    content: str = Field(
        ..., min_length=1, max_length=10000, description="Note content"
    )
    is_private: bool = False

    @validator("content")
    def content_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Note content cannot be empty")
        return v.strip()


# ============================================================================
# Workstream Research Status Models
# ============================================================================


class WorkstreamResearchStatus(BaseModel):
    """Research status for a card in a workstream."""

    card_id: str = Field(..., description="UUID of the underlying card")
    task_id: str = Field(..., description="UUID of the research task")
    task_type: str = Field(
        ..., description="Type of research (quick_update, deep_research)"
    )
    status: str = Field(
        ..., description="Task status (queued, processing, completed, failed)"
    )
    started_at: Optional[datetime] = Field(None, description="When research started")
    completed_at: Optional[datetime] = Field(
        None, description="When research completed"
    )


class WorkstreamResearchStatusResponse(BaseModel):
    """Response containing active research tasks for a workstream's cards."""

    tasks: List[WorkstreamResearchStatus] = Field(
        default=[], description="Active research tasks"
    )


# ============================================================================
# Filter Preview Models
# ============================================================================


class FilterPreviewRequest(BaseModel):
    """Request model for filter preview (estimate matching cards)."""

    pillar_ids: List[str] = Field(
        default=[], description="List of pillar codes to filter by"
    )
    goal_ids: List[str] = Field(
        default=[], description="List of goal codes to filter by"
    )
    stage_ids: List[str] = Field(
        default=[], description="List of stage numbers to filter by"
    )
    horizon: Optional[str] = Field(
        default=None, description="Horizon filter (H1, H2, H3, or ALL)"
    )
    keywords: List[str] = Field(
        default=[], description="Keywords to match in card content"
    )


class FilterPreviewResponse(BaseModel):
    """Response model for filter preview."""

    estimated_count: int = Field(..., description="Estimated number of matching cards")
    sample_cards: List[dict] = Field(
        default=[], description="Sample of matching cards (up to 5)"
    )


# ============================================================================
# Workstream Scan Models
# ============================================================================


class WorkstreamScanResponse(BaseModel):
    """Response for starting a workstream scan."""

    scan_id: str = Field(..., description="UUID of the scan job")
    workstream_id: str = Field(..., description="UUID of the workstream")
    status: str = Field(
        ..., description="Scan status (queued, running, completed, failed)"
    )
    message: str = Field(..., description="User-friendly status message")


class WorkstreamScanStatusResponse(BaseModel):
    """Response for scan status check."""

    scan_id: str
    workstream_id: str
    status: str
    config: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, Any]] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str


class WorkstreamScanHistoryResponse(BaseModel):
    """Response for scan history."""

    scans: List[WorkstreamScanStatusResponse]
    total: int
    scans_remaining_today: int
