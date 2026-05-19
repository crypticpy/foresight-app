-- Community tagging system v1 (see CLAUDE.md > Card domain).
--
-- Two-table folksonomy layered on top of cards:
--
--   tags       — global dictionary of tag labels (one row per unique slug).
--   card_tags  — junction with one row per (card, tag, user) so each user
--                "owns" their tag application. Click-to-coapply on the UI
--                inserts another row pointing at the same tag; the chip
--                count = distinct user rows for that (card, tag).
--
-- Display rule (frontend): a user always sees their own tags first
-- (alphabetical), then everyone else's (alphabetical), capped at 10 visible.
-- More applications are allowed; the cap is a UI-only display choice.
--
-- Authorization: writes flow through the service-role backend (routers/tags.py
-- and routers/admin_tags.py). RLS policies below are defense-in-depth so a
-- direct PostgREST client can't tamper with someone else's rows.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Global tag dictionary.
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram index for fast ILIKE-style autocomplete.
CREATE INDEX IF NOT EXISTS idx_tags_label_trgm
    ON tags USING gin (label gin_trgm_ops);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authed can read tags" ON tags;
CREATE POLICY "Anyone authed can read tags"
    ON tags FOR SELECT
    USING (auth.role() = 'authenticated');

-- INSERT/UPDATE/DELETE intentionally have no public policy: only the
-- service-role backend writes to this table (find-or-create on tag add,
-- admin merge/rename/delete).

-- 2. Junction: one row per (card, tag, user).
CREATE TABLE IF NOT EXISTS card_tags (
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workstream_id UUID REFERENCES workstreams(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, tag_id, user_id)
);

-- (card_id, tag_id) is already covered by the PK's leading edge.
-- The other two access patterns need their own indexes.
CREATE INDEX IF NOT EXISTS idx_card_tags_tag_id ON card_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_card_tags_user_id ON card_tags(user_id);

ALTER TABLE card_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authed can read card_tags" ON card_tags;
CREATE POLICY "Anyone authed can read card_tags"
    ON card_tags FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can insert own card_tags" ON card_tags;
CREATE POLICY "Users can insert own card_tags"
    ON card_tags FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own card_tags" ON card_tags;
CREATE POLICY "Users can delete own card_tags"
    ON card_tags FOR DELETE
    USING (auth.uid() = user_id);

-- 3. Slug normalization helper. Mirrors the JS-side normalization the
-- frontend uses before showing autocomplete results so "Climate Resilience",
-- "climate resilience", and "  Climate-Resilience  " all collapse to
-- "climate-resilience".
CREATE OR REPLACE FUNCTION public.normalize_tag_slug(input TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
    SELECT regexp_replace(
        regexp_replace(lower(trim(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
    );
$$;

GRANT EXECUTE ON FUNCTION public.normalize_tag_slug(TEXT)
    TO authenticated, service_role;

COMMIT;
