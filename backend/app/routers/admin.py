"""Admin aggregator router.

Owns the shared ``/api/v1`` prefix and ``admin`` tag, and mounts every
admin sub-router. There are **no inline endpoints** in this module —
adding a new admin endpoint means picking (or creating) the right
sub-router and including it below, never adding a handler here.

Sub-routers mounted here
------------------------
* ``admin_taxonomy.py`` — ``GET /taxonomy`` (read-only pillar / goal /
  anchor / stage rows for the frontend taxonomy selectors).
* ``admin_scan.py`` — ``POST /admin/scan`` (admin-only trigger that
  queues update research tasks for stale active cards, 3/min limit).
* ``admin_source_rating.py`` — ``POST /sources/{id}/rate``,
  ``GET /sources/{id}/ratings``, ``DELETE /sources/{id}/rate`` (upsert
  / aggregate / remove user ratings, with parent-card SQI recalc).
* ``admin_quality.py`` — card-level SQI breakdown / recalculation and
  the standalone signal_quality score endpoints.
* ``admin_domain_reputation.py`` — list / get / create / update / delete
  / recalculate for the domain reputation system.
* ``admin_velocity.py`` — ``POST /admin/velocity/calculate`` (admin-only
  background trigger for the velocity-trends recalculation).
* ``admin_lens_backfill.py`` — ``POST /admin/classify/backfill``
  (idempotent lens-classification cascade re-run with version filter).
* ``admin_embedding_backfill.py`` — ``POST /admin/embeddings/backfill``
  + ``GET /admin/embeddings/backfill/status`` (re-embed corpus after
  model rotation, with per-table cursor and 409 overlap guard).
* ``admin_users.py`` — ``GET /admin/users``, ``PATCH /admin/users/{id}``,
  ``GET /admin/users/guests``, ``POST /admin/users/{id}/account_type``
  (admin user management with bounded audit logging + profile cache
  eviction).
* ``admin_settings.py`` — ``GET /admin/settings``,
  ``PATCH /admin/settings/{key}``, ``POST /admin/discovery/preset``
  (settings catalog + per-key save with audit + bulk discovery preset
  application; owns ``SETTING_DEFINITIONS`` / ``DISCOVERY_PRESETS``).
* ``admin_overview.py`` — ``GET /admin/overview`` (admin-console
  operational snapshot of user / card / workstream / job counts plus
  live runtime flag values).
* ``admin_jobs.py`` — ``GET /admin/jobs/recent`` (recent research tasks
  / discovery runs / workstream scans for the admin activity panel).
* ``admin_audit.py`` — ``GET /admin/audit`` (paginated, filterable read
  of the append-only ``admin_audit_log`` table; writes happen in
  ``audit_service`` from each mutating endpoint).

When adding another endpoint cluster: create ``admin_<name>.py``, add
the import and ``include_router`` line below. Do NOT change the parent
prefix — keep ``/api/v1`` in exactly one place so the URL surface
doesn't drift.

The block of ``foo = sub_module.foo`` re-exports below preserves the
``app.routers.admin.foo`` attribute access path used by older tests
and ad-hoc callers. New code should import handlers / models directly
from the sub-router module rather than reaching for these aliases.
"""

from fastapi import APIRouter

from . import (
    admin_audit,
    admin_domain_reputation,
    admin_embedding_backfill,
    admin_jobs,
    admin_lens_backfill,
    admin_overview,
    admin_quality,
    admin_scan,
    admin_settings,
    admin_source_rating,
    admin_taxonomy,
    admin_users,
    admin_velocity,
)

router = APIRouter(prefix="/api/v1", tags=["admin"])

# Mount sub-routers under the shared /api/v1 prefix.
router.include_router(admin_taxonomy.router)
router.include_router(admin_scan.router)
router.include_router(admin_source_rating.router)
router.include_router(admin_quality.router)
router.include_router(admin_domain_reputation.router)
router.include_router(admin_velocity.router)
router.include_router(admin_lens_backfill.router)
router.include_router(admin_embedding_backfill.router)
router.include_router(admin_users.router)
router.include_router(admin_settings.router)
router.include_router(admin_overview.router)
router.include_router(admin_jobs.router)
router.include_router(admin_audit.router)


# Back-compat re-exports. Tests and legacy callers reach handlers /
# models / constants by attribute on this module; production code
# should import directly from the sub-router. Keep this block in sync
# when sub-routers add or rename public symbols.
get_taxonomy = admin_taxonomy.get_taxonomy

trigger_manual_scan = admin_scan.trigger_manual_scan

rate_source = admin_source_rating.rate_source
get_source_ratings = admin_source_rating.get_source_ratings
delete_source_rating = admin_source_rating.delete_source_rating

get_card_quality = admin_quality.get_card_quality
recalculate_card_quality = admin_quality.recalculate_card_quality
recalculate_all_quality = admin_quality.recalculate_all_quality
get_signal_quality_score = admin_quality.get_signal_quality_score
refresh_signal_quality_score = admin_quality.refresh_signal_quality_score

list_domain_reputations = admin_domain_reputation.list_domain_reputations
get_domain_reputation = admin_domain_reputation.get_domain_reputation
create_domain_reputation = admin_domain_reputation.create_domain_reputation
update_domain_reputation = admin_domain_reputation.update_domain_reputation
delete_domain_reputation = admin_domain_reputation.delete_domain_reputation
recalculate_domain_reputations = (
    admin_domain_reputation.recalculate_domain_reputations
)

trigger_velocity_calculation = admin_velocity.trigger_velocity_calculation

trigger_lens_backfill = admin_lens_backfill.trigger_lens_backfill
LensBackfillRequest = admin_lens_backfill.LensBackfillRequest

trigger_embedding_backfill = admin_embedding_backfill.trigger_embedding_backfill
get_embedding_backfill_status = (
    admin_embedding_backfill.get_embedding_backfill_status
)
EmbeddingBackfillRequest = admin_embedding_backfill.EmbeddingBackfillRequest

list_admin_users = admin_users.list_admin_users
update_admin_user = admin_users.update_admin_user
list_guest_users = admin_users.list_guest_users
update_user_account_type = admin_users.update_user_account_type
AccountTypeUpdate = admin_users.AccountTypeUpdate
AdminUserUpdate = admin_users.AdminUserUpdate

list_admin_settings = admin_settings.list_admin_settings
update_admin_setting = admin_settings.update_admin_setting
apply_discovery_preset = admin_settings.apply_discovery_preset
AdminSettingUpdate = admin_settings.AdminSettingUpdate
DiscoveryPresetApply = admin_settings.DiscoveryPresetApply
SETTING_DEFINITIONS = admin_settings.SETTING_DEFINITIONS
DISCOVERY_PRESETS = admin_settings.DISCOVERY_PRESETS

get_admin_overview = admin_overview.get_admin_overview

list_recent_admin_jobs = admin_jobs.list_recent_admin_jobs

list_admin_audit = admin_audit.list_admin_audit
