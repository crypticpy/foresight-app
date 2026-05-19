-- Tag-detail RPC fixes (PR 5a follow-up).
--
-- Two bugs from PR #223 fixed at the SQL layer:
--
-- 1. The previous tag_cards_page didn't constrain to active cards, so the
--    route applied `.eq("status", "active")` *after* slicing the page.
--    Pages overlapping archived cards then returned fewer than `limit`
--    rows even when more active cards existed beyond the offset, and
--    `total` over-counted by the archived-card population.
--
-- 2. The window-function `total` only exists on returned rows. When the
--    offset is past the last row the page is empty and the route fell
--    back to `total = 0`, violating the contract that `total` reflects
--    the global count regardless of pagination.
--
-- Fix:
--   - Join cards inside the CTE so LIMIT/OFFSET (and the window count)
--     both apply post-filter.
--   - Add a dedicated tag_cards_count(p_tag_id) RPC that the route can
--     call as a fallback when the page is empty but offset > 0.

BEGIN;

CREATE OR REPLACE FUNCTION public.tag_cards_page(
    p_tag_id UUID,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    card_id UUID,
    most_recent_at TIMESTAMPTZ,
    total BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH ranked AS (
        SELECT
            ct.card_id,
            MAX(ct.created_at) AS most_recent_at
        FROM public.card_tags ct
        JOIN public.cards c
          ON c.id = ct.card_id
         AND c.status = 'active'
        WHERE ct.tag_id = p_tag_id
        GROUP BY ct.card_id
    ),
    counted AS (
        SELECT
            card_id,
            most_recent_at,
            COUNT(*) OVER () AS total
        FROM ranked
    )
    SELECT
        card_id,
        most_recent_at,
        total
    FROM counted
    ORDER BY most_recent_at DESC, card_id
    LIMIT p_limit
    OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.tag_cards_count(p_tag_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT COUNT(DISTINCT ct.card_id)
    FROM public.card_tags ct
    JOIN public.cards c
      ON c.id = ct.card_id
     AND c.status = 'active'
    WHERE ct.tag_id = p_tag_id;
$$;

GRANT EXECUTE ON FUNCTION public.tag_cards_count(UUID)
    TO authenticated, service_role;

COMMIT;
