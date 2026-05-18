"""Analytics and metrics router (aggregator).

This module owns the shared ``/api/v1`` prefix and ``analytics`` tag and
mounts focused sub-routers for each endpoint cluster. It contains no
inline endpoints — every analytics endpoint now lives in a sub-router.

Sub-routers mounted here
------------------------
* ``analytics_processing.py`` — ``GET /metrics/processing`` (monitoring
  dashboard aggregates over the last ``days`` window).
* ``analytics_dashboards.py`` — ``GET /analytics/pillar-coverage``,
  ``GET /analytics/velocity``, ``GET /analytics/top-domains``.
* ``analytics_insights.py`` — ``GET /analytics/insights`` (AI-generated
  strategic insights with 24-hour cache).
* ``analytics_system_stats.py`` — ``GET /analytics/system-stats``
  (comprehensive org-wide rollup of card counts, distributions,
  trending pillars, hot topics, and engagement metrics).
* ``analytics_personal_stats.py`` — ``GET /analytics/personal-stats``
  (per-user follows, engagement comparison vs. community, pillar
  affinity, social-discovery suggestions, workstream counts).
* ``analytics_lens.py`` — ``GET /analytics/lens-overview`` (strategic
  anchor radar, CSP heatmap, signal-type donut, issue-tag chips, KPI
  sparklines, and 24-hour delta strip for dashboard v2).

When extracting another endpoint cluster, add the import + an
``include_router`` line below. Do NOT change the parent prefix — keep
``/api/v1`` in exactly one place so the URL surface doesn't drift.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from . import (
    analytics_dashboards,
    analytics_insights,
    analytics_lens,
    analytics_personal_stats,
    analytics_processing,
    analytics_system_stats,
)

# Re-export for back-compat: tests / legacy callers reach
# ``analytics.get_processing_metrics`` etc. by attribute. Production code
# should import from the sub-router directly.
get_processing_metrics = analytics_processing.get_processing_metrics
get_pillar_coverage = analytics_dashboards.get_pillar_coverage
get_trend_velocity = analytics_dashboards.get_trend_velocity
get_top_domains = analytics_dashboards.get_top_domains
get_analytics_insights = analytics_insights.get_analytics_insights
get_system_wide_stats = analytics_system_stats.get_system_wide_stats
get_personal_stats = analytics_personal_stats.get_personal_stats
get_lens_overview = analytics_lens.get_lens_overview

# Internal helper exposed for test patching. Tests in
# ``test_lens_overview.py`` rebind ``analytics._fetch_all_paginated`` with
# a smaller page size to exercise the pagination branch on tiny fixtures.
_fetch_all_paginated = analytics_lens._fetch_all_paginated

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["analytics"])

# Mount sub-routers under the shared /api/v1 prefix.
router.include_router(analytics_processing.router)
router.include_router(analytics_dashboards.router)
router.include_router(analytics_insights.router)
router.include_router(analytics_system_stats.router)
router.include_router(analytics_personal_stats.router)
router.include_router(analytics_lens.router)
