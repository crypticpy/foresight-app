-- Migration: tighten_sources_registry_rls
-- Created at: 2026-05-09
-- Phase: PR #33 follow-up
--
-- PURPOSE:
--   The initial discovery_sources_registry migration granted SELECT to every
--   authenticated user. The catalog is admin-only data — non-admin pilot users
--   should not see the list of feeds, weights, or last_failure_reason values.
--   The admin console reads this table through the FastAPI service path
--   (require_admin() + service-role client), so the authenticated read policy
--   is unnecessary.
--
-- ROLLBACK:
--   CREATE POLICY dsr_authenticated_read
--       ON public.discovery_sources_registry FOR SELECT
--       TO authenticated
--       USING (TRUE);
-- ============================================================================

DROP POLICY IF EXISTS dsr_authenticated_read ON public.discovery_sources_registry;

-- service_role retains full access via dsr_service_role_all (defined in
-- 20260509000001_discovery_sources_registry.sql). No replacement read policy
-- is needed — the admin console hits /admin/sources, which uses the
-- service-role client and gates with require_admin().
