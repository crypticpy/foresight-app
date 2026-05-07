-- ============================================================================
-- Strategic Frameworks + Workstream Extensions (Phase 2 of FY26 reactivation)
-- ============================================================================
-- Implements docs/11_PRD_Scoped_Workstreams_and_Frameworks.md §3 (data model).
--
-- Adds three new tables to model strategic frameworks (e.g. PPP, CSP) as a
-- data-driven taxonomy:
--
--   strategic_frameworks   - top-level framework (code, name, owner_type)
--   framework_categories   - first-level grouping inside a framework
--                            (e.g. "People", "Place", "Partnerships" inside PPP)
--   drivers                - second-level taxonomy nodes inside a category
--                            (used for filtering and card classification)
--
-- Extends workstreams to reference these new tables and to carry the
-- additional fields needed by the FY26 work (purpose statement, budget
-- relevance bullets, top-25 alignment, owner_type for org-vs-user split).
--
-- RLS: framework tables are public-read for authed users.  Workstream RLS
-- is rewritten so that org workstreams (owner_type='org') are visible to
-- all authed users while only the owner can mutate them.

-- ----------------------------------------------------------------------------
-- 1) Frameworks taxonomy
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS strategic_frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    owner_type TEXT NOT NULL DEFAULT 'org' CHECK (owner_type IN ('org', 'user')),
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategic_frameworks_code
    ON strategic_frameworks (code);

CREATE TABLE IF NOT EXISTS framework_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_code TEXT NOT NULL REFERENCES strategic_frameworks(code) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (framework_code, code)
);

CREATE INDEX IF NOT EXISTS idx_framework_categories_framework
    ON framework_categories (framework_code);

CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_category_id UUID NOT NULL REFERENCES framework_categories(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (framework_category_id, code)
);

CREATE INDEX IF NOT EXISTS idx_drivers_category
    ON drivers (framework_category_id);

-- ----------------------------------------------------------------------------
-- 2) Workstreams extensions
-- ----------------------------------------------------------------------------

ALTER TABLE workstreams
    ADD COLUMN IF NOT EXISTS framework_code TEXT
        REFERENCES strategic_frameworks(code) ON DELETE SET NULL;

ALTER TABLE workstreams
    ADD COLUMN IF NOT EXISTS framework_category_id UUID
        REFERENCES framework_categories(id) ON DELETE SET NULL;

ALTER TABLE workstreams
    ADD COLUMN IF NOT EXISTS driver_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE workstreams
    ADD COLUMN IF NOT EXISTS top25_priority_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE workstreams
    ADD COLUMN IF NOT EXISTS budget_relevance TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE workstreams
    ADD COLUMN IF NOT EXISTS purpose_statement TEXT;

ALTER TABLE workstreams
    ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'user'
        CHECK (owner_type IN ('user', 'org'));

CREATE INDEX IF NOT EXISTS idx_workstreams_framework_code
    ON workstreams (framework_code);

CREATE INDEX IF NOT EXISTS idx_workstreams_owner_type
    ON workstreams (owner_type);

-- ----------------------------------------------------------------------------
-- 3) RLS
-- ----------------------------------------------------------------------------

ALTER TABLE strategic_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE framework_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- All authed users can read framework taxonomy (org-owned reference data).
CREATE POLICY "Authenticated users can view frameworks"
    ON strategic_frameworks
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view framework categories"
    ON framework_categories
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view drivers"
    ON drivers
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Service role bypasses RLS for inserts/updates (seeding + admin tooling).

-- Workstream RLS: org workstreams visible to all authed users; mutations
-- restricted to owner.  Drop the previous "manage own" policy and replace
-- with explicit per-action policies.

DROP POLICY IF EXISTS "Users can manage own workstreams" ON workstreams;

CREATE POLICY "Users can view own and org workstreams"
    ON workstreams
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR owner_type = 'org'
    );

CREATE POLICY "Users can insert own workstreams"
    ON workstreams
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND owner_type = 'user'
    );

CREATE POLICY "Users can update own workstreams"
    ON workstreams
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workstreams"
    ON workstreams
    FOR DELETE
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) updated_at triggers (reuse project-wide update_updated_at() function)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_strategic_frameworks_updated_at ON strategic_frameworks;
CREATE TRIGGER update_strategic_frameworks_updated_at
    BEFORE UPDATE ON strategic_frameworks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_framework_categories_updated_at ON framework_categories;
CREATE TRIGGER update_framework_categories_updated_at
    BEFORE UPDATE ON framework_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_drivers_updated_at ON drivers;
CREATE TRIGGER update_drivers_updated_at
    BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- 5) Comments
-- ----------------------------------------------------------------------------

COMMENT ON TABLE strategic_frameworks IS
    'Top-level strategic frameworks (e.g. PPP, CSP) used to scope workstreams.';
COMMENT ON TABLE framework_categories IS
    'First-level grouping inside a framework (e.g. People, Place, Partnerships in PPP).';
COMMENT ON TABLE drivers IS
    'Second-level taxonomy nodes inside a category, used for filtering cards and seeding workstream queries.';
COMMENT ON COLUMN workstreams.owner_type IS
    'user = personal workstream owned by user_id; org = organization-wide workstream visible to all authed users.';
COMMENT ON COLUMN workstreams.budget_relevance IS
    'Free-text bullets describing how this workstream connects to specific budget lines (used by Looking Ahead export).';
COMMENT ON COLUMN workstreams.purpose_statement IS
    'Markdown-friendly purpose statement shown on the workstream detail header.';
