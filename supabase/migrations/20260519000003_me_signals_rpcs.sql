-- /me/signals + /me/signals/stats Cloudflare URL-length fix.
--
-- Background: both endpoints take an in-memory union of (followed ∪ created ∪
-- workstream) card IDs and filter `cards` with `.in_("id", filtered_ids)`.
-- For users with ~300 cards the resulting URL exceeds Cloudflare's ~8KB
-- request-line limit and Cloudflare returns an HTML 400 page that postgrest
-- then fails to parse as JSON (request_id 5d2a2767-... in prod).
--
-- Fix: same predicate, but moved into RPCs that take the ID array in the JSON
-- request body via PostgREST's rpc/ endpoint. ANY(uuid[]) is index-friendly
-- and the URL stays a fixed ~50 chars regardless of how big the array gets.

-- All 5 stats counts in a single round-trip.
CREATE OR REPLACE FUNCTION public.me_signals_counts(
    p_card_ids uuid[],
    p_followed_ids uuid[],
    p_created_ids uuid[],
    p_search text,
    p_pillar text,
    p_horizon text,
    p_quality_min int,
    p_one_week_ago timestamptz,
    p_needs_research_threshold int
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT json_build_object(
        'total', COUNT(*),
        'updates_this_week', COUNT(*) FILTER (WHERE updated_at >= p_one_week_ago),
        'needs_research', COUNT(*) FILTER (WHERE signal_quality_score < p_needs_research_threshold),
        'followed_count', COUNT(*) FILTER (WHERE id = ANY(p_followed_ids)),
        'created_count', COUNT(*) FILTER (WHERE id = ANY(p_created_ids))
    )
    FROM public.cards
    WHERE id = ANY(p_card_ids)
      AND status = 'active'
      AND (
        p_search IS NULL
        OR p_search = ''
        OR name ILIKE '%' || p_search || '%'
        OR summary ILIKE '%' || p_search || '%'
      )
      AND (p_pillar IS NULL OR pillar_id = p_pillar)
      AND (p_horizon IS NULL OR horizon = p_horizon)
      AND (
        p_quality_min IS NULL
        OR p_quality_min <= 0
        OR signal_quality_score >= p_quality_min
      );
$$;

GRANT EXECUTE ON FUNCTION public.me_signals_counts(
    uuid[], uuid[], uuid[], text, text, text, int, timestamptz, int
) TO authenticated, service_role;

-- Feed page: sorted + paginated row fetch for sort_by in (quality, name, updated).
-- followed-sort still does in-memory ordering in Python (the order key lives
-- on card_follows, not cards) — see me_signals_filter_ids below for that path.
CREATE OR REPLACE FUNCTION public.me_signals_feed_page(
    p_card_ids uuid[],
    p_search text,
    p_pillar text,
    p_horizon text,
    p_quality_min int,
    p_sort_by text,
    p_limit int,
    p_offset int
)
RETURNS SETOF public.cards
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT c.*
    FROM public.cards c
    WHERE c.id = ANY(p_card_ids)
      AND c.status = 'active'
      AND (
        p_search IS NULL
        OR p_search = ''
        OR c.name ILIKE '%' || p_search || '%'
        OR c.summary ILIKE '%' || p_search || '%'
      )
      AND (p_pillar IS NULL OR c.pillar_id = p_pillar)
      AND (p_horizon IS NULL OR c.horizon = p_horizon)
      AND (
        p_quality_min IS NULL
        OR p_quality_min <= 0
        OR c.signal_quality_score >= p_quality_min
      )
    ORDER BY
        CASE WHEN p_sort_by = 'quality' THEN c.signal_quality_score END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'name' THEN c.name END ASC,
        CASE WHEN p_sort_by = 'updated' OR p_sort_by NOT IN ('quality','name') THEN c.updated_at END DESC,
        c.id DESC
    LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.me_signals_feed_page(
    uuid[], text, text, text, int, text, int, int
) TO authenticated, service_role;

-- Filter-only IDs: returns the subset of p_card_ids that pass status='active'
-- + the shared filters. Used by the followed-sort path which needs to sort
-- in-memory by card_follows.created_at but must respect the same filters as
-- the rest of the feed.
CREATE OR REPLACE FUNCTION public.me_signals_filter_ids(
    p_card_ids uuid[],
    p_search text,
    p_pillar text,
    p_horizon text,
    p_quality_min int
)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT c.id
    FROM public.cards c
    WHERE c.id = ANY(p_card_ids)
      AND c.status = 'active'
      AND (
        p_search IS NULL
        OR p_search = ''
        OR c.name ILIKE '%' || p_search || '%'
        OR c.summary ILIKE '%' || p_search || '%'
      )
      AND (p_pillar IS NULL OR c.pillar_id = p_pillar)
      AND (p_horizon IS NULL OR c.horizon = p_horizon)
      AND (
        p_quality_min IS NULL
        OR p_quality_min <= 0
        OR c.signal_quality_score >= p_quality_min
      );
$$;

GRANT EXECUTE ON FUNCTION public.me_signals_filter_ids(
    uuid[], text, text, text, int
) TO authenticated, service_role;
