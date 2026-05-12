-- Lock down SECURITY DEFINER functions to least-privilege EXECUTE.
--
-- These functions are SECURITY DEFINER (they bypass the caller's RLS by
-- running as the function owner). Supabase's advisor warns that anon +
-- authenticated currently have EXECUTE, which means anyone with the public
-- anon key could invoke them via PostgREST.
--
-- Functional impact: the backend uses the service-role client (deps.py),
-- which bypasses EXECUTE grants. So REVOKE here is a no-op for the backend.
-- The one exception below is `get_dashboard_stats`, which the frontend
-- (`useDashboardData.ts`) invokes with the authenticated user's JWT — that
-- function retains EXECUTE for `authenticated` only.

-- ---------------------------------------------------------------------------
-- 1) Backend-only callables: revoke from anon AND authenticated
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.approve_discovered_card(p_card_id uuid, p_reviewer_id uuid)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.card_follower_counts(card_ids uuid[])
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_workstream_scan_rate_limit(p_workstream_id uuid)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_insights()
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_search_history()
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_workstream_scan_atomic(
        p_workstream_id uuid, p_user_id uuid, p_config jsonb)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_matching_blocks(
        content_embedding extensions.vector, match_threshold double precision)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_similar_cards(
        query_embedding extensions.vector, exclude_card_id uuid,
        match_threshold double precision, match_count integer)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cached_insights(
        p_pillar_filter text, p_limit integer)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_discovery_queue(
        p_user_id uuid, p_limit integer, p_offset integer)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_workstream_scan(p_workstream_id uuid)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_block_count(p_topic_name text)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_deep_research_count(p_card_id uuid)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_share_link_view(link_id uuid)
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_discovered_card(
        p_card_id uuid, p_reviewer_id uuid, p_reason text)
    FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Trigger functions: revoke from anon AND authenticated.
--    Triggers fire by the SQL engine regardless of EXECUTE grants;
--    nobody should be invoking these via PostgREST.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.update_discovered_sources_updated_at()
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_discovery_blocks_updated_at()
    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_pattern_insights_updated_at()
    FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Frontend-callable: revoke from anon, keep for authenticated.
--    useDashboardData.ts invokes get_dashboard_stats with the user's JWT.
--    There is no use case for the anon role to fetch dashboard stats.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(p_user_id uuid) FROM anon;
