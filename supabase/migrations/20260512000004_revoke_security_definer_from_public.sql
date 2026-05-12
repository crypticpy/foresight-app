-- Corrective follow-up to 20260512000002.
--
-- Postgres auto-grants EXECUTE on every function to PUBLIC at creation
-- time. The previous migration revoked from anon + authenticated, but
-- PUBLIC still includes those roles, so the advisor warnings stayed and
-- the functions remained callable. The fix is to revoke from PUBLIC.
--
-- For functions the frontend invokes (get_dashboard_stats), grant
-- EXECUTE back to `authenticated` after the PUBLIC revoke. Service-role
-- bypasses these grants so the backend is unaffected.

-- ---------------------------------------------------------------------------
-- 1) Backend-only callables: REVOKE EXECUTE FROM PUBLIC
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.approve_discovered_card(p_card_id uuid, p_reviewer_id uuid)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.card_follower_counts(card_ids uuid[])
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_workstream_scan_rate_limit(p_workstream_id uuid)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_insights()
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_search_history()
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_workstream_scan_atomic(
        p_workstream_id uuid, p_user_id uuid, p_config jsonb)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_matching_blocks(
        content_embedding extensions.vector, match_threshold double precision)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_similar_cards(
        query_embedding extensions.vector, exclude_card_id uuid,
        match_threshold double precision, match_count integer)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cached_insights(
        p_pillar_filter text, p_limit integer)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_discovery_queue(
        p_user_id uuid, p_limit integer, p_offset integer)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_workstream_scan(p_workstream_id uuid)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_block_count(p_topic_name text)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_deep_research_count(p_card_id uuid)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_share_link_view(link_id uuid)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_discovered_card(
        p_card_id uuid, p_reviewer_id uuid, p_reason text)
    FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2) Trigger functions: REVOKE EXECUTE FROM PUBLIC.
--    Triggers fire by the SQL engine regardless of EXECUTE grants.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.update_discovered_sources_updated_at()
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_discovery_blocks_updated_at()
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_pattern_insights_updated_at()
    FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3) Frontend-callable: REVOKE FROM PUBLIC, then GRANT to authenticated.
--    `useDashboardData.ts` invokes get_dashboard_stats with the user's JWT.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(p_user_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_stats(p_user_id uuid) TO authenticated;
