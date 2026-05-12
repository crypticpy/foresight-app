-- Migration: csp_goal_query_aliases
--
-- PURPOSE:
--   Cache LLM-derived search queries on csp_goals so the upcoming coverage
--   balancer (PR-E) can dispatch goal-targeted discovery runs without
--   re-translating the goal-name+description on every click. ``query_aliases``
--   is plain TEXT[] (4-6 short queries per goal) and ``query_aliases_version``
--   stores the prompt/classifier version that produced the cache so the
--   service can invalidate it when prompts change.
--
-- IDEMPOTENCY:
--   ADD COLUMN IF NOT EXISTS on both columns. CREATE INDEX IF NOT EXISTS on
--   the supporting GIN index. Running this migration twice is a no-op.
--
-- ROLLBACK:
--   ALTER TABLE public.csp_goals DROP COLUMN IF EXISTS query_aliases;
--   ALTER TABLE public.csp_goals DROP COLUMN IF EXISTS query_aliases_version;
--   DROP INDEX IF EXISTS public.csp_goals_query_aliases_gin;
-- ============================================================================

ALTER TABLE public.csp_goals
    ADD COLUMN IF NOT EXISTS query_aliases TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.csp_goals
    ADD COLUMN IF NOT EXISTS query_aliases_version TEXT;

-- Partial GIN — only index goals that actually have aliases cached. The
-- table is small (~23 rows) but the index keeps lookups against very
-- large alias arrays cheap and means "find any goal that mentions X" is
-- a single index probe rather than a sequential scan.
CREATE INDEX IF NOT EXISTS csp_goals_query_aliases_gin
    ON public.csp_goals USING GIN (query_aliases)
    WHERE cardinality(query_aliases) > 0;

COMMENT ON COLUMN public.csp_goals.query_aliases IS
    'LLM-derived web-search queries for this goal. Populated lazily by csp_goal_query_service.derive_queries() and invalidated when query_aliases_version no longer matches CLASSIFIER_VERSION.';
COMMENT ON COLUMN public.csp_goals.query_aliases_version IS
    'Prompt/classifier version that produced the cached query_aliases. NULL until the first derivation runs.';
