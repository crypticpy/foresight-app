-- Close the remaining `rls_disabled_in_public` advisor findings.
--
-- All six tables below are accessed exclusively by the backend through the
-- service-role Supabase client (deps.py), which bypasses RLS. Reads from
-- the frontend go through `/api/v1/...` endpoints rather than supabase-js
-- against these tables. So we mirror the `safety_incidents` pattern
-- (20260509000007): enable RLS, revoke privileges from anon + authenticated,
-- keep service_role access intact. No policies needed; the implicit deny
-- is the correct behavior.
--
-- Reference data (strategic_anchors, csp_goals, csp_measures): if a future
-- change wants direct frontend reads via supabase-js, add an explicit
-- `FOR SELECT TO authenticated USING (true)` policy in a separate migration.

-- ---------------------------------------------------------------------------
-- System / operational data
-- ---------------------------------------------------------------------------

ALTER TABLE public.discovery_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discovery_schedule FROM anon, authenticated;
GRANT  ALL ON public.discovery_schedule TO   service_role;

ALTER TABLE public.rss_feeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rss_feeds FROM anon, authenticated;
GRANT  ALL ON public.rss_feeds TO   service_role;

ALTER TABLE public.rss_feed_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rss_feed_items FROM anon, authenticated;
GRANT  ALL ON public.rss_feed_items TO   service_role;

-- ---------------------------------------------------------------------------
-- Reference data (CSP lens tables seeded via migrations)
-- ---------------------------------------------------------------------------

ALTER TABLE public.strategic_anchors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.strategic_anchors FROM anon, authenticated;
GRANT  ALL ON public.strategic_anchors TO   service_role;

ALTER TABLE public.csp_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.csp_goals FROM anon, authenticated;
GRANT  ALL ON public.csp_goals TO   service_role;

ALTER TABLE public.csp_measures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.csp_measures FROM anon, authenticated;
GRANT  ALL ON public.csp_measures TO   service_role;
