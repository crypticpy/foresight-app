-- Migration: discovery_schedule_extensions (PR E)
-- Adds the columns the admin schedule-CRUD UI needs to surface per-schedule
-- scope. All additive — safe on databases that already have the v1
-- ``discovery_schedule`` table from 20260213000001.
--
-- Why these columns:
--   categories_to_scan — lets one schedule run only RSS while another runs
--                        the full pipeline; defaults to all live categories.
--   source_ids         — optional allowlist into ``discovery_sources_registry``
--                        (PR A). NULL = "use the registry's enabled set".
--   notes              — short admin-facing description; no semantics.

ALTER TABLE public.discovery_schedule
    ADD COLUMN IF NOT EXISTS categories_to_scan TEXT[]
        DEFAULT ARRAY['rss', 'news', 'academic', 'government', 'tech_blog'],
    ADD COLUMN IF NOT EXISTS source_ids UUID[],
    ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.discovery_schedule.categories_to_scan IS
    'Discovery source categories this schedule should scan. Defaults to all live categories.';
COMMENT ON COLUMN public.discovery_schedule.source_ids IS
    'Optional allowlist of discovery_sources_registry.id rows. NULL means honor the registry enabled flag for the chosen categories.';
COMMENT ON COLUMN public.discovery_schedule.notes IS
    'Admin-facing notes — purpose of the schedule, owner, etc.';
