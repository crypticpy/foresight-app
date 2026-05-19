-- Tag-detail page RPC (PR 5 of the tagging-system stack).
--
-- Returns a paginated list of distinct card_ids that carry a given tag,
-- ordered by the most-recent application of that tag (so a card that
-- just got tagged bubbles back to the top). Includes `total` on every
-- row via a window function so the caller can render "showing N of M"
-- without a second query.
--
-- Aggregating by card_id deduplicates rows when multiple users have
-- applied the same tag to the same card — without this, naive
-- ordering on card_tags.created_at would return the same card_id
-- across pages and break offset-based pagination.

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

GRANT EXECUTE ON FUNCTION public.tag_cards_page(UUID, INT, INT)
    TO authenticated, service_role;

COMMIT;
