-- Card-tags batch RPC (PR 4 of the tagging-system stack).
--
-- A single call returns tag rows for many card IDs in one trip, so list views
-- (Signals, Discover) can hydrate mini tag badges across the visible viewport
-- without N round-trips. Same ordering as card_tag_summary: viewer's own
-- applications first (alphabetical), then everyone else (alphabetical).

BEGIN;

CREATE OR REPLACE FUNCTION public.card_tags_batch(
    p_card_ids UUID[],
    p_viewer_user_id UUID
)
RETURNS TABLE (
    card_id UUID,
    id UUID,
    slug TEXT,
    label TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ,
    count BIGINT,
    applied_by_me BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        ct.card_id,
        t.id,
        t.slug,
        t.label,
        t.created_by,
        t.created_at,
        COUNT(DISTINCT ct.user_id) AS count,
        BOOL_OR(ct.user_id = p_viewer_user_id) AS applied_by_me
    FROM public.card_tags ct
    JOIN public.tags t ON t.id = ct.tag_id
    WHERE ct.card_id = ANY(p_card_ids)
    GROUP BY ct.card_id, t.id, t.slug, t.label, t.created_by, t.created_at
    ORDER BY
        ct.card_id,
        BOOL_OR(ct.user_id = p_viewer_user_id) DESC,
        t.label ASC;
$$;

GRANT EXECUTE ON FUNCTION public.card_tags_batch(UUID[], UUID)
    TO authenticated, service_role;

COMMIT;
