"""Admin endpoints for the discovery pipeline (aggregator).

This file is a thin FastAPI aggregator: it owns the single ``/api/v1``
prefix and ``admin-discovery`` tag, and mounts the five focused
sub-routers that contain the actual endpoints:

* ``admin_discovery_sources.py``    — ``/admin/sources*`` source-catalog CRUD.
* ``admin_discovery_coverage.py``   — ``/admin/coverage/*`` dashboards plus
  ``/admin/csp-goals/{id}/refresh-queries``.
* ``admin_discovery_balance.py``    — ``/admin/discovery/balance`` and
  ``/admin/workstreams/{id}/scan``.
* ``admin_discovery_runs.py``       — ``/admin/discovery/runs/{id}/detail``.
* ``admin_discovery_schedules.py``  — ``/admin/discovery/schedules*`` CRUD.

When adding a new admin-discovery endpoint, put it in (or create) the
right sub-router, then add an ``include_router`` line below. Do NOT add
endpoints to this file directly — keep it as a pure aggregator.

The mutating endpoints in the sub-routers reuse ``log_admin_action`` from
``app.audit_service`` so every change shows up in the existing audit log.
"""

from __future__ import annotations

from fastapi import APIRouter

from . import (
    admin_discovery_balance,
    admin_discovery_coverage,
    admin_discovery_runs,
    admin_discovery_schedules,
    admin_discovery_sources,
)

# ---------------------------------------------------------------------------
# Back-compat attribute surface
# ---------------------------------------------------------------------------
#
# Tests (and a small handful of legacy callers) still reach into this module
# by attribute, e.g. ``admin_discovery.get_pillar_coverage`` or
# ``admin_discovery.BalanceDispatchRequest``. Production code should import
# from the sub-router directly. The explicit attribute assignments below
# keep those attribute lookups resolving after the split — rather than
# re-importing with a noqa-tagged star-import we surface the intent as
# plain assignments the linter is happy with.

# Coverage dashboards.
get_pillar_coverage = admin_discovery_coverage.get_pillar_coverage
get_coverage_gaps = admin_discovery_coverage.get_coverage_gaps
get_workstream_coverage = admin_discovery_coverage.get_workstream_coverage
admin_refresh_goal_queries = admin_discovery_coverage.admin_refresh_goal_queries
_aggregate_workstream_freshness = (
    admin_discovery_coverage._aggregate_workstream_freshness
)
_gap_priority = admin_discovery_coverage._gap_priority
PILLAR_DEFINITIONS = admin_discovery_coverage.PILLAR_DEFINITIONS
ALLOWED_COVERAGE_DAYS = admin_discovery_coverage.ALLOWED_COVERAGE_DAYS
ALLOWED_COVERAGE_MODES = admin_discovery_coverage.ALLOWED_COVERAGE_MODES
CoverageMode = admin_discovery_coverage.CoverageMode
TargetDistribution = admin_discovery_coverage.TargetDistribution
ALLOWED_GAP_TARGETS = admin_discovery_coverage.ALLOWED_GAP_TARGETS
GAP_PRIORITY_HIGH_THRESHOLD = admin_discovery_coverage.GAP_PRIORITY_HIGH_THRESHOLD
GAP_PRIORITY_MEDIUM_THRESHOLD = admin_discovery_coverage.GAP_PRIORITY_MEDIUM_THRESHOLD

# Balance + force-scan.
admin_balance_dispatch = admin_discovery_balance.admin_balance_dispatch
admin_force_workstream_scan = admin_discovery_balance.admin_force_workstream_scan
BalanceDispatchRequest = admin_discovery_balance.BalanceDispatchRequest
_auto_pick_starved_goals = admin_discovery_balance._auto_pick_starved_goals
BALANCE_MAX_GOALS = admin_discovery_balance.BALANCE_MAX_GOALS
BALANCE_DEFAULT_QUERIES_PER_GOAL = admin_discovery_balance.BALANCE_DEFAULT_QUERIES_PER_GOAL
BALANCE_MAX_QUERIES_PER_GOAL = admin_discovery_balance.BALANCE_MAX_QUERIES_PER_GOAL
BALANCE_GLOBAL_QUERY_CAP = admin_discovery_balance.BALANCE_GLOBAL_QUERY_CAP
BALANCE_DEFAULT_CATEGORIES = admin_discovery_balance.BALANCE_DEFAULT_CATEGORIES

# Source-catalog CRUD.
list_admin_sources = admin_discovery_sources.list_admin_sources
create_admin_source = admin_discovery_sources.create_admin_source
update_admin_source = admin_discovery_sources.update_admin_source
delete_admin_source = admin_discovery_sources.delete_admin_source
AdminSourceCreate = admin_discovery_sources.AdminSourceCreate
AdminSourceUpdate = admin_discovery_sources.AdminSourceUpdate

# Run-detail.
get_discovery_run_detail = admin_discovery_runs.get_discovery_run_detail
_aggregate_run_counts = admin_discovery_runs._aggregate_run_counts
DISCOVERED_SOURCE_DETAIL_COLUMNS = admin_discovery_runs.DISCOVERED_SOURCE_DETAIL_COLUMNS
DISCOVERED_SOURCE_DETAIL_SELECT = admin_discovery_runs.DISCOVERED_SOURCE_DETAIL_SELECT
MAX_AGGREGATE_FETCH = admin_discovery_runs.MAX_AGGREGATE_FETCH

# Schedule CRUD.
list_admin_schedules = admin_discovery_schedules.list_admin_schedules
create_admin_schedule = admin_discovery_schedules.create_admin_schedule
update_admin_schedule = admin_discovery_schedules.update_admin_schedule
delete_admin_schedule = admin_discovery_schedules.delete_admin_schedule
AdminScheduleBase = admin_discovery_schedules.AdminScheduleBase
AdminScheduleCreate = admin_discovery_schedules.AdminScheduleCreate
AdminScheduleUpdate = admin_discovery_schedules.AdminScheduleUpdate
_validate_schedule_lists = admin_discovery_schedules._validate_schedule_lists
_serialize_schedule = admin_discovery_schedules._serialize_schedule
_coerce_schedule_payload = admin_discovery_schedules._coerce_schedule_payload
ALLOWED_SCHEDULE_CATEGORIES = admin_discovery_schedules.ALLOWED_SCHEDULE_CATEGORIES
ALLOWED_PILLAR_CODES = admin_discovery_schedules.ALLOWED_PILLAR_CODES


# ---------------------------------------------------------------------------
# Aggregator
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1", tags=["admin-discovery"])

# Mount order doesn't matter functionally (each sub-router owns disjoint
# paths) but we keep it in the same order the docstring lists them so the
# file is easy to scan top-to-bottom.
router.include_router(admin_discovery_sources.router)
router.include_router(admin_discovery_coverage.router)
router.include_router(admin_discovery_balance.router)
router.include_router(admin_discovery_runs.router)
router.include_router(admin_discovery_schedules.router)
