-- Replace NULL ``pillar_filter`` with a ``__all__`` sentinel.
--
-- The original schema (1766438000_cached_insights.sql) declared
-- ``UNIQUE(pillar_filter, insight_limit, cache_date)`` and stored
-- ``NULL`` for the "all pillars" view. PostgreSQL treats NULL ≠ NULL
-- under uniqueness, so the ON CONFLICT clause on the upsert never
-- matched for the all-pillars row — every regeneration appended a
-- new row instead of replacing the previous day's entry. With a
-- 24-hour expiry window the table grew unbounded between cleanups.
--
-- PR #193 (CodeRabbit thread on the read path) papered over the
-- duplicates by ordering by ``generated_at desc`` on read; this
-- migration removes the duplicates at the source by writing a
-- non-NULL sentinel value (``__all__``) that ON CONFLICT can
-- actually match.
--
-- After this migration:
--   * Existing NULL rows are coalesced into the sentinel.
--   * The column is NOT NULL.
--   * The unique constraint behaves correctly for the all-pillars row.
--   * The companion ``get_cached_insights`` SQL function (still
--     SECURITY DEFINER but no public EXECUTE since 20260512000002)
--     translates a NULL parameter into the sentinel so its lookup
--     still matches.

BEGIN;

-- 1. Collapse existing NULL rows into the sentinel.
--    There may already be more than one NULL row for the same
--    (insight_limit, cache_date) tuple — pick the newest by
--    ``generated_at`` and delete the rest so the subsequent UPDATE
--    won't trip the unique constraint. ``DELETE ... USING`` is the
--    idiomatic way to keep one row per group.
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY insight_limit, cache_date
               ORDER BY generated_at DESC, id DESC
           ) AS rn
    FROM public.cached_insights
    WHERE pillar_filter IS NULL
)
DELETE FROM public.cached_insights ci
USING duplicates d
WHERE ci.id = d.id
  AND d.rn > 1;

UPDATE public.cached_insights
SET pillar_filter = '__all__'
WHERE pillar_filter IS NULL;

-- 2. Lock the convention in. The CHECK constraint stops a future
--    caller from silently writing NULL again and is cheap to enforce
--    (table is small + short-lived rows).
ALTER TABLE public.cached_insights
    ALTER COLUMN pillar_filter SET NOT NULL;

ALTER TABLE public.cached_insights
    ADD CONSTRAINT cached_insights_pillar_filter_nonempty
    CHECK (length(pillar_filter) > 0);

COMMENT ON COLUMN public.cached_insights.pillar_filter IS
    'Pillar code (CH, EW, HG, HH, MC, PS) or the literal sentinel ''__all__'' '
    'for the cross-pillar view. NULL is no longer permitted — the sentinel '
    'is required so ON CONFLICT (pillar_filter, insight_limit, cache_date) '
    'fires for the all-pillars row.';

-- 3. Update the read-side helper. Existing callers may still pass
--    NULL for the all-pillars case; translate to the sentinel so the
--    function keeps working without changing its signature.
CREATE OR REPLACE FUNCTION public.get_cached_insights(
    p_pillar_filter TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    cached_data JSONB;
    v_pillar_filter TEXT := COALESCE(p_pillar_filter, '__all__');
BEGIN
    SELECT insights_json INTO cached_data
    FROM public.cached_insights
    WHERE pillar_filter = v_pillar_filter
      AND insight_limit = p_limit
      AND cache_date = CURRENT_DATE
      AND expires_at > NOW()
    LIMIT 1;

    RETURN cached_data;
END;
$$;

COMMIT;
