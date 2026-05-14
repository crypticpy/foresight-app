-- Per-user workstream clones foundation (see docs/26_per_user_workstream_clones_plan.md).
--
-- This migration:
--   1. Widens workstreams.owner_type to allow 'user_clone'.
--   2. Adds workstreams.cloned_from_id self-FK pointing at the source template.
--   3. Creates user_workstream_clones (pointer rows) for first-touch + Friday fan-out.
--   4. Creates user_workstream_card_dismissals (tombstones) so the Friday job
--      doesn't re-deliver cards the user already dismissed.
--   5. Tightens RLS on workstreams: orgs are no longer broadly readable; users
--      see only their own rows (their clones + their personal workstreams).
--
-- Rollback notes:
--   - DROP TABLE user_workstream_card_dismissals;
--   - DROP TABLE user_workstream_clones;
--   - ALTER TABLE workstreams DROP COLUMN cloned_from_id;
--   - Re-add the original owner_type CHECK constraint without 'user_clone'.
--   - Restore the previous "Users can view own and org workstreams" SELECT policy.

BEGIN;

-- 1. Widen owner_type CHECK to include 'user_clone'.
ALTER TABLE workstreams DROP CONSTRAINT IF EXISTS workstreams_owner_type_check;
ALTER TABLE workstreams
    ADD CONSTRAINT workstreams_owner_type_check
    CHECK (owner_type IN ('user', 'org', 'user_clone'));

-- 2. Self-FK from clone -> template.  Nullable; non-clones leave it NULL.
ALTER TABLE workstreams
    ADD COLUMN IF NOT EXISTS cloned_from_id UUID
    REFERENCES workstreams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workstreams_cloned_from_id
    ON workstreams(cloned_from_id)
    WHERE cloned_from_id IS NOT NULL;

-- 3. Pointer rows: one per (user, template) so first-touch + Friday fan-out
--    can find the right clone without scanning the workstreams table.
CREATE TABLE IF NOT EXISTS user_workstream_clones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    clone_workstream_id UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    last_fanout_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_user_workstream_clones_user_id
    ON user_workstream_clones(user_id);
CREATE INDEX IF NOT EXISTS idx_user_workstream_clones_template_id
    ON user_workstream_clones(template_id);
CREATE INDEX IF NOT EXISTS idx_user_workstream_clones_clone_workstream_id
    ON user_workstream_clones(clone_workstream_id);

ALTER TABLE user_workstream_clones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own clone pointers" ON user_workstream_clones;
CREATE POLICY "Users can view own clone pointers"
    ON user_workstream_clones FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own clone pointers" ON user_workstream_clones;
CREATE POLICY "Users can delete own clone pointers"
    ON user_workstream_clones FOR DELETE
    USING (auth.uid() = user_id);

-- Inserts/updates flow through the service-role client; no public INSERT policy.

-- 4. Dismissal tombstones: composite PK on (user, template, card) so the
--    Friday job can skip cards the user already dropped from their clone.
CREATE TABLE IF NOT EXISTS user_workstream_card_dismissals (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, template_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_user_workstream_card_dismissals_user_template
    ON user_workstream_card_dismissals(user_id, template_id);

ALTER TABLE user_workstream_card_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own dismissals" ON user_workstream_card_dismissals;
CREATE POLICY "Users can view own dismissals"
    ON user_workstream_card_dismissals FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own dismissals" ON user_workstream_card_dismissals;
CREATE POLICY "Users can delete own dismissals"
    ON user_workstream_card_dismissals FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Tighten workstreams RLS.
--    Previously: any authenticated user could SELECT every org-owned workstream.
--    Now: users see only rows they own; admins see everything (via service role).
--    Templates are reached via the clone, not the template itself.

DROP POLICY IF EXISTS "Users can view own and org workstreams" ON workstreams;
DROP POLICY IF EXISTS "Users can view own workstreams" ON workstreams;
CREATE POLICY "Users can view own workstreams"
    ON workstreams FOR SELECT
    USING (auth.uid() = user_id);

-- INSERTs from end-user clients must be plain user workstreams; clones come
-- from the service role.  Tighten the existing INSERT policy if present.
DROP POLICY IF EXISTS "Users can insert own workstreams" ON workstreams;
CREATE POLICY "Users can insert own workstreams"
    ON workstreams FOR INSERT
    WITH CHECK (auth.uid() = user_id AND owner_type = 'user');

COMMIT;
