"""Response models for the admin coverage endpoints.

Shapes the payloads returned by:

- ``GET /admin/coverage/pillars``    -> ``AdminPillarCoverageResponse``
- ``GET /admin/coverage/gaps``       -> ``CoverageGapsResponse``
- ``GET /admin/coverage/workstreams`` -> ``WorkstreamCoverageResponse``
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

# Mirror the Literal aliases defined in ``routers/admin_discovery.py`` so the
# response schema reflects the constrained values the endpoints actually
# return. Sourcery flagged these as plain ``str`` in PR #144 review.
CoverageMode = Literal["primary", "primary_or_secondary", "union"]
TargetDistribution = Literal["uniform"]
# ``_gap_priority`` in admin_discovery.py returns exactly these three strings.
CoverageGapPriority = Literal["high", "medium", "none"]


# --- Pillar coverage --------------------------------------------------------

class AdminPillarCoverageBucket(BaseModel):
    """One pillar's row in the coverage histogram.

    ``cards`` is the count under the selected ``mode``; the three
    per-channel fields let the UI annotate the same bar with badges
    without re-fetching.
    """

    name: str
    cards: int
    primary_cards: int
    secondary_cards: int
    csp_linked_cards: int
    share: float
    expected_share: float
    drift: float


class AdminPillarCoverageResponse(BaseModel):
    """Envelope returned by ``GET /admin/coverage/pillars``."""

    window_days: int
    mode: CoverageMode
    since: str
    total: int
    mode_total: int
    unassigned: int
    by_pillar: Dict[str, AdminPillarCoverageBucket]


# --- Coverage gaps ----------------------------------------------------------

class CoverageGapCell(BaseModel):
    """One (pillar, csp_goal) cell of the gap heatmap."""

    pillar_code: str
    goal_id: str
    goal_code: str
    goal_name: str
    cards_in_window: int
    expected: float
    drift: float
    drift_score: float
    priority: CoverageGapPriority


class CoverageGapTotals(BaseModel):
    """Aggregate counters that accompany the cell grid."""

    credits: int
    goals: int
    expected_per_cell: float
    underrepresented_cells: int


class CoverageGapsResponse(BaseModel):
    """Envelope returned by ``GET /admin/coverage/gaps``."""

    window_days: int
    target_distribution: TargetDistribution
    since: str
    cells: List[CoverageGapCell]
    totals: CoverageGapTotals


# --- Workstream coverage ----------------------------------------------------

class WorkstreamFreshnessRow(BaseModel):
    """One workstream's freshness row.

    ``id``/``name`` are nullable because the upstream query is permissive
    and may surface a row mid-rename where one of the columns is briefly
    missing. The frontend renders ``"(unnamed)"`` in that case.
    """

    id: Optional[str] = None
    name: Optional[str] = None
    owner_type: str = "user"
    auto_scan: bool = False
    last_scanned_at: Optional[str] = None
    scans_30d: int = 0
    cards_added_30d: int = 0


class WorkstreamCoverageResponse(BaseModel):
    """Envelope returned by ``GET /admin/coverage/workstreams``."""

    items: List[WorkstreamFreshnessRow] = Field(default_factory=list)
    total: int
