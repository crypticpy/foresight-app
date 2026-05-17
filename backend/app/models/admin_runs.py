"""Response models for the admin discovery-run + schedule endpoints.

Covers:

- ``POST /admin/discovery/balance``               -> ``BalanceDispatchResponse``
- ``POST /admin/workstreams/{id}/scan``           -> ``AdminWorkstreamScanResponse``
- ``GET  /admin/discovery/runs/{id}/detail``      -> ``DiscoveryRunDetailResponse``
- ``GET  /admin/discovery/schedules``             -> ``AdminSchedulesListResponse``
- ``POST /admin/discovery/schedules``             -> ``AdminScheduleRow``
- ``PATCH /admin/discovery/schedules/{id}``       -> ``AdminScheduleRow``

DELETE returns 204 and needs no ``response_model``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .discovery_models import CustomQuerySpec, DiscoveryRun


# --- Balance dispatch -------------------------------------------------------

class BalanceDispatchGoalUsed(BaseModel):
    """One CSP goal credited by a balance dispatch."""

    id: str
    code: Optional[str] = None
    name: Optional[str] = None
    pillar_code: str
    query_count: int


class BalanceDispatchDerivationError(BaseModel):
    """One goal that failed query derivation; the run still proceeds."""

    goal_id: str
    code: Optional[str] = None
    error: str


class BalanceDispatchResponse(BaseModel):
    """Envelope returned by ``POST /admin/discovery/balance``."""

    run_id: str
    goals_used: List[BalanceDispatchGoalUsed]
    queued_queries: List[CustomQuerySpec]
    derivation_errors: List[BalanceDispatchDerivationError] = Field(
        default_factory=list
    )
    categories: List[str]


# --- Admin force-scan workstream --------------------------------------------

class AdminWorkstreamScanResponse(BaseModel):
    """Envelope returned by ``POST /admin/workstreams/{id}/scan``."""

    scan_id: Optional[str] = None
    workstream_id: str
    status: str


# --- Discovery run detail ---------------------------------------------------

class DiscoveryRunCardOutcomes(BaseModel):
    """Per-card-outcome counters."""

    card_created: int = 0
    card_enriched: int = 0


class DiscoveryRunTriageCounts(BaseModel):
    """Per-triage-bucket counters."""

    passed: int = 0
    failed: int = 0
    pending: int = 0


class DiscoveryRunDetailTotals(BaseModel):
    """Aggregate counters surfaced on the run-detail page.

    ``by_processing_status`` and ``by_error_stage`` are dynamic dicts keyed
    by status / stage strings as they appear in ``discovered_sources``.
    """

    by_processing_status: Dict[str, int] = Field(default_factory=dict)
    by_triage: DiscoveryRunTriageCounts = Field(
        default_factory=DiscoveryRunTriageCounts
    )
    by_error_stage: Dict[str, int] = Field(default_factory=dict)
    card_outcomes: DiscoveryRunCardOutcomes = Field(
        default_factory=DiscoveryRunCardOutcomes
    )
    sources_total: int
    aggregate_truncated: bool


class DiscoveredSourceDetailRow(BaseModel):
    """One ``discovered_sources`` row in the paginated detail slice.

    All columns are optional — the upstream select pulls a wide column
    set and any field can be null mid-pipeline. ``extra="allow"`` so a
    future column added to ``DISCOVERED_SOURCE_DETAIL_COLUMNS`` flows
    through without a model rev.
    """

    id: Optional[str] = None
    url: Optional[str] = None
    title: Optional[str] = None
    content_snippet: Optional[str] = None
    domain: Optional[str] = None
    source_type: Optional[str] = None
    published_at: Optional[datetime] = None
    search_query: Optional[str] = None
    query_pillar: Optional[str] = None
    query_priority: Optional[str] = None
    triage_is_relevant: Optional[bool] = None
    triage_confidence: Optional[float] = None
    triage_primary_pillar: Optional[str] = None
    triage_reason: Optional[str] = None
    triaged_at: Optional[datetime] = None
    analysis_summary: Optional[str] = None
    analysis_horizon: Optional[str] = None
    analysis_suggested_card_name: Optional[str] = None
    analysis_credibility: Optional[float] = None
    analysis_novelty: Optional[float] = None
    analysis_likelihood: Optional[float] = None
    analysis_impact: Optional[float] = None
    analysis_relevance: Optional[float] = None
    analyzed_at: Optional[datetime] = None
    dedup_status: Optional[str] = None
    dedup_matched_card_id: Optional[str] = None
    dedup_similarity_score: Optional[float] = None
    deduplicated_at: Optional[datetime] = None
    processing_status: Optional[str] = None
    resulting_card_id: Optional[str] = None
    resulting_source_id: Optional[str] = None
    error_message: Optional[str] = None
    error_stage: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"extra": "allow"}


class DiscoveryRunDetailSourcesPage(BaseModel):
    """Paginated slice of the run's discovered_sources rows."""

    items: List[DiscoveredSourceDetailRow]
    limit: int
    offset: int
    has_more: bool


class DiscoveryRunDetailResponse(BaseModel):
    """Envelope returned by ``GET /admin/discovery/runs/{id}/detail``."""

    run: DiscoveryRun
    totals: DiscoveryRunDetailTotals
    sources: DiscoveryRunDetailSourcesPage


# --- Schedule CRUD ----------------------------------------------------------

class AdminScheduleRow(BaseModel):
    """Normalised ``discovery_schedule`` row used by every schedule response.

    Mirrors the shape emitted by ``_serialize_schedule`` in
    ``routers/admin_discovery.py``.
    """

    id: Optional[str] = None
    name: Optional[str] = None
    enabled: bool = False
    interval_hours: int = 24
    max_search_queries_per_run: int = 20
    pillars_to_scan: List[str] = Field(default_factory=list)
    process_rss_first: bool = True
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    next_run_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    last_run_summary: Optional[Dict[str, Any]] = None
    categories_to_scan: List[str] = Field(default_factory=list)
    source_ids: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AdminSchedulesListResponse(BaseModel):
    """Envelope returned by ``GET /admin/discovery/schedules``."""

    items: List[AdminScheduleRow]
    total: int
