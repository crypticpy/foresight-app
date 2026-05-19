-- Card-tags follow-up: empty/whitespace labels (Sourcery PR #218).
--
-- normalize_tag_slug used to return '' for null/whitespace input, which:
--   (a) creates a meaningless empty-string tag, and
--   (b) collides on subsequent blank inputs because tags.slug is UNIQUE,
--       surfacing as a 500 instead of a clean 400.
--
-- Fix: function returns NULL for empty input so callers can detect and
-- reject early; plus a CHECK constraint as defense-in-depth at the DB.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_tag_slug(input TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
    SELECT NULLIF(
        regexp_replace(
            regexp_replace(lower(trim(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g'
        ),
        ''
    );
$$;

ALTER TABLE tags
    DROP CONSTRAINT IF EXISTS tags_slug_nonempty;
ALTER TABLE tags
    ADD CONSTRAINT tags_slug_nonempty CHECK (length(slug) > 0);

COMMIT;
