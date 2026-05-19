-- Card-tags RPCs (PR 2 of the tagging-system stack).
--
-- These helpers keep three operations atomic + cheap:
--
--   find_or_create_tag(label, created_by)
--     - Normalizes label → slug, returns the existing tag, or creates one
--       and returns it. Atomic via ON CONFLICT, so two users adding the
--       same brand-new tag at once both end up pointing at the same row.
--       Returns NULL when the normalized slug is empty (caller raises 400).
--
--   card_tag_summary(card_id, viewer_user_id)
--     - Returns the per-card tag list with chip count + applied_by_me,
--       ordered with the viewer's tags first (alphabetical), then the
--       rest (alphabetical). One round trip instead of join-in-Python.
--
--   popular_tags(p_limit)
--     - Tag dictionary ordered by distinct-card count desc, for sidebar
--       facets and admin lists.

BEGIN;

-- 1. Atomic find-or-create. Returns the resulting tag row (or NULL when
-- the input label normalizes to an empty slug).
CREATE OR REPLACE FUNCTION public.find_or_create_tag(
    p_label TEXT,
    p_created_by UUID
)
RETURNS public.tags
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_slug TEXT;
    v_label TEXT;
    v_tag public.tags;
BEGIN
    v_slug := public.normalize_tag_slug(p_label);
    IF v_slug IS NULL THEN
        RETURN NULL;
    END IF;

    -- Preserve the human-readable label the *first* creator chose (the
    -- table's UNIQUE(slug) makes slug the natural key; the label is only
    -- used for display casing).
    v_label := trim(p_label);

    INSERT INTO public.tags (slug, label, created_by)
    VALUES (v_slug, v_label, p_created_by)
    ON CONFLICT (slug) DO UPDATE
        SET slug = excluded.slug  -- no-op: lets RETURNING return the existing row
    RETURNING * INTO v_tag;

    RETURN v_tag;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_or_create_tag(TEXT, UUID)
    TO authenticated, service_role;


-- 2. Tag list for a single card, ordered for the viewer.
CREATE OR REPLACE FUNCTION public.card_tag_summary(
    p_card_id UUID,
    p_viewer_user_id UUID
)
RETURNS TABLE (
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
        t.id,
        t.slug,
        t.label,
        t.created_by,
        t.created_at,
        COUNT(DISTINCT ct.user_id) AS count,
        BOOL_OR(ct.user_id = p_viewer_user_id) AS applied_by_me
    FROM public.card_tags ct
    JOIN public.tags t ON t.id = ct.tag_id
    WHERE ct.card_id = p_card_id
    GROUP BY t.id, t.slug, t.label, t.created_by, t.created_at
    ORDER BY
        -- Viewer's tags first, then everyone else.
        BOOL_OR(ct.user_id = p_viewer_user_id) DESC,
        t.label ASC;
$$;

GRANT EXECUTE ON FUNCTION public.card_tag_summary(UUID, UUID)
    TO authenticated, service_role;


-- 3. Popular tags ordered by distinct-card count.
CREATE OR REPLACE FUNCTION public.popular_tags(p_limit INT DEFAULT 20)
RETURNS TABLE (
    id UUID,
    slug TEXT,
    label TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ,
    application_count BIGINT,
    card_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        t.id,
        t.slug,
        t.label,
        t.created_by,
        t.created_at,
        COUNT(*) AS application_count,
        COUNT(DISTINCT ct.card_id) AS card_count
    FROM public.tags t
    LEFT JOIN public.card_tags ct ON ct.tag_id = t.id
    GROUP BY t.id, t.slug, t.label, t.created_by, t.created_at
    ORDER BY card_count DESC, application_count DESC, t.label ASC
    LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.popular_tags(INT)
    TO authenticated, service_role;

COMMIT;
