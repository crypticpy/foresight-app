"""Discovery models for Foresight API.

Models for discovery run configuration, status tracking,
and related helper functions.
"""

import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


def get_discovery_max_queries():
    """Get max queries from environment."""
    return int(os.getenv("DISCOVERY_MAX_QUERIES", "100"))


def get_discovery_max_sources():
    """Get max sources from environment."""
    return int(os.getenv("DISCOVERY_MAX_SOURCES_TOTAL", "500"))


class CustomQuerySpec(BaseModel):
    """A pre-built search query injected into a discovery run.

    Used by the coverage balancer dispatcher (`POST /admin/discovery/balance`)
    to seed runs with LLM-derived goal queries instead of the hardcoded
    pillar/priority generator. When the discovery service receives a non-empty
    list of these, ``_generate_queries`` returns them verbatim and the rest of
    the pipeline (search, triage, classification, signal-agent) is unchanged.
    """

    query_text: str = Field(..., min_length=1, max_length=200)
    pillar_code: str = Field(..., min_length=1, max_length=8)
    source_context: str = Field(
        default="balance",
        description="Tag for telemetry / debugging — usually 'balance'.",
    )


class DiscoveryConfigRequest(BaseModel):
    """Request model for discovery run configuration."""

    max_queries_per_run: Optional[int] = Field(
        None,
        le=200,
        ge=1,
        description="Maximum queries per run (defaults to DISCOVERY_MAX_QUERIES env var)",
    )
    max_sources_total: Optional[int] = Field(
        None,
        le=1000,
        ge=10,
        description="Maximum sources to process (defaults to DISCOVERY_MAX_SOURCES_TOTAL env var)",
    )
    auto_approve_threshold: float = Field(
        default=0.95, ge=0.8, le=1.0, description="Auto-approval threshold"
    )
    pillars_filter: Optional[List[str]] = Field(
        None, description="Filter by pillar IDs"
    )
    dry_run: bool = Field(False, description="Run in dry-run mode without persisting")
    # Per-schedule scope overrides (PR E). Optional; when set, restrict the
    # run to these source categories and / or registry rows. Without these
    # fields the discovery service falls back to the global config.
    categories_to_scan: Optional[List[str]] = Field(
        None,
        description=(
            "Restrict the run to these source categories (e.g. ['rss','news']). "
            "Categories not in the list are disabled for this run."
        ),
    )
    source_ids: Optional[List[str]] = Field(
        None,
        description=(
            "Restrict the run to these discovery_sources_registry row IDs. "
            "Only URLs from these rows are scanned."
        ),
    )
    # Coverage-balancer overrides. When set, the discovery service skips the
    # pillar/priority generator and runs only these queries.
    custom_queries: Optional[List[CustomQuerySpec]] = Field(
        None,
        description=(
            "Replace the auto-generated query list with these pre-built queries. "
            "Used by the coverage balancer to target starved CSP goals."
        ),
    )
    enable_multi_source: Optional[bool] = Field(
        None,
        description=(
            "Override the RSS / news / academic / gov / tech-blog multi-source "
            "fetcher. Defaults to True. Balance runs pass False so they don't "
            "dilute targeted queries with the general RSS firehose."
        ),
    )


class DiscoveryRun(BaseModel):
    """Response model for discovery run status matching database schema."""

    id: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str  # running, completed, failed, cancelled
    triggered_by: str  # manual, scheduled, api
    triggered_by_user: Optional[str] = None
    # Discovery metrics
    pillars_scanned: Optional[List[str]] = None
    priorities_scanned: Optional[List[str]] = None
    queries_generated: Optional[int] = None
    sources_found: int = 0
    sources_relevant: Optional[int] = None
    cards_created: int = 0
    cards_enriched: int = 0
    cards_deduplicated: int = 0
    # Cost and reporting
    estimated_cost: Optional[float] = None
    summary_report: Optional[Dict[str, Any]] = None
    # Error handling
    error_message: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None
    # Timestamps
    created_at: Optional[datetime] = None
