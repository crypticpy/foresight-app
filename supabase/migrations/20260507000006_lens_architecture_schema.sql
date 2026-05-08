-- ============================================================================
-- Lens Architecture — Schema (Phase 1 of FY26 reactivation, Lens layer)
-- ============================================================================
-- Adds the schema for treating frameworks as saved-view configurations over
-- per-card metadata. See docs/18_FEATURE_Lens_Architecture.md for the full
-- design.
--
-- Components:
--   1. New columns on `cards` for richer metadata (signal_type,
--      secondary_pillars, anchor_scores, csp_goal/measure refs, issue_tags,
--      budget/climate assessments, user_metadata, classifier_version).
--   2. New table `strategic_anchors` — six fixed cross-cutting values
--      from the Citywide Strategic Plan (p.3).
--   3. New tables `csp_goals` and `csp_measures` — the CSP hierarchy seeded
--      in the companion migration `20260507000007_csp_goals_measures_seed.sql`.
--   4. Adds the `CSP` framework as a row in `strategic_frameworks`, sibling
--      of PPP, plus six framework_categories rows mapping CSP back to the
--      existing pillar codes so existing rendering paths work unchanged.
--
-- Idempotent: re-running the migration leaves the data in the same state.
-- All schema changes use `IF NOT EXISTS`; all seed inserts use
-- `ON CONFLICT … DO UPDATE`.

-- ----------------------------------------------------------------------------
-- 1) Card metadata additions
-- ----------------------------------------------------------------------------

ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS signal_type        TEXT
        CHECK (signal_type IS NULL OR signal_type IN ('trend', 'driver', 'signal')),
    ADD COLUMN IF NOT EXISTS secondary_pillars  TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],
    ADD COLUMN IF NOT EXISTS anchor_scores      JSONB,
    ADD COLUMN IF NOT EXISTS csp_goal_ids       UUID[]      NOT NULL DEFAULT '{}'::UUID[],
    ADD COLUMN IF NOT EXISTS csp_measure_ids    UUID[]      NOT NULL DEFAULT '{}'::UUID[],
    ADD COLUMN IF NOT EXISTS issue_tags         TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],
    ADD COLUMN IF NOT EXISTS budget_assessment  JSONB,
    ADD COLUMN IF NOT EXISTS climate_assessment JSONB,
    ADD COLUMN IF NOT EXISTS user_metadata      JSONB       NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS classifier_version TEXT,
    ADD COLUMN IF NOT EXISTS classified_at      TIMESTAMPTZ;

COMMENT ON COLUMN cards.signal_type IS
    'Foresight vocabulary classification: trend (pattern of change), driver (force causing change), signal (early indicator).';
COMMENT ON COLUMN cards.secondary_pillars IS
    'Additional pillar codes for cross-cutting cards. Primary pillar stays in cards.pillar.';
COMMENT ON COLUMN cards.anchor_scores IS
    'Per-anchor 0-100 scores. Shape: {equity, affordability, innovation, sustainability_resiliency, proactive_prevention, community_trust}.';
COMMENT ON COLUMN cards.csp_goal_ids IS
    'CSP goals this card relates to (references csp_goals.id).';
COMMENT ON COLUMN cards.csp_measure_ids IS
    'CSP measures this card moves the needle on (references csp_measures.id).';
COMMENT ON COLUMN cards.issue_tags IS
    'Closed-vocabulary tags. Supersedes per-driver hardcoding.';
COMMENT ON COLUMN cards.budget_assessment IS
    'Operational dimension. Shape: {relevance, dimensions[], magnitude_band, cycle}.';
COMMENT ON COLUMN cards.climate_assessment IS
    'Operational dimension for climate overlay (see docs/13_FEATURE_Climate_Overlay.md). Shape: {relevance, drivers[], horizon}.';
COMMENT ON COLUMN cards.user_metadata IS
    'User-edited metadata layer. Shape: {overrides:{...}, added:{...}, removed:{...}}. Re-classification never overwrites this.';
COMMENT ON COLUMN cards.classifier_version IS
    'Version string of the prompts used to classify this card. Bumping triggers re-classification.';
COMMENT ON COLUMN cards.classified_at IS
    'Timestamp of the most recent classification run.';

CREATE INDEX IF NOT EXISTS cards_classifier_version_idx
    ON cards (classifier_version, classified_at);
CREATE INDEX IF NOT EXISTS cards_secondary_pillars_idx
    ON cards USING GIN (secondary_pillars);
CREATE INDEX IF NOT EXISTS cards_csp_goal_ids_idx
    ON cards USING GIN (csp_goal_ids);
CREATE INDEX IF NOT EXISTS cards_csp_measure_ids_idx
    ON cards USING GIN (csp_measure_ids);
CREATE INDEX IF NOT EXISTS cards_issue_tags_idx
    ON cards USING GIN (issue_tags);

-- ----------------------------------------------------------------------------
-- 2) Strategic anchors (six fixed cross-cutting values from CSP plan p.3)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS strategic_anchors (
    code          TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT,
    display_order INT  NOT NULL DEFAULT 0
);

COMMENT ON TABLE strategic_anchors IS
    'Six cross-cutting values from the Citywide Strategic Plan (p.3). Cards score 0-100 against each; lens views filter by score thresholds.';

INSERT INTO strategic_anchors (code, name, description, display_order)
VALUES
    ('equity',                      'Equity',
     'Fair access and outcomes across community.',                                  1),
    ('affordability',               'Affordability',
     'Cost burden on residents and household stability.',                           2),
    ('innovation',                  'Innovation',
     'New approaches, technology, and process improvement.',                        3),
    ('sustainability_resiliency',   'Sustainability & Resiliency',
     'Environmental, climate, and operational resilience.',                         4),
    ('proactive_prevention',        'Proactive Prevention',
     'Getting ahead of harms instead of reacting.',                                 5),
    ('community_trust',             'Community Trust & Relationships',
     'Civic engagement, transparency, and partnership.',                            6)
ON CONFLICT (code) DO UPDATE SET
    name          = EXCLUDED.name,
    description   = EXCLUDED.description,
    display_order = EXCLUDED.display_order;

-- ----------------------------------------------------------------------------
-- 3) CSP hierarchy tables (Goals → Measures)
-- ----------------------------------------------------------------------------
-- Strategies (the 4th level in the CSP hierarchy) are intentionally NOT
-- modelled in the database. They change quarterly via the AMP cycle and
-- are too granular to be a stable structured tag target.

CREATE TABLE IF NOT EXISTS csp_goals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pillar_code   TEXT NOT NULL
        CHECK (pillar_code IN ('CH', 'EW', 'HG', 'HH', 'MC', 'PS')),
    code          TEXT NOT NULL,                   -- 'CH.1'
    name          TEXT NOT NULL,
    description   TEXT,
    display_order INT  NOT NULL DEFAULT 0,
    UNIQUE (pillar_code, code)
);

COMMENT ON TABLE csp_goals IS
    'CSP Goals (~23 rows). Codes follow Pillar.Goal pattern (e.g. CH.1).';

CREATE INDEX IF NOT EXISTS csp_goals_pillar_idx
    ON csp_goals (pillar_code, display_order);

CREATE TABLE IF NOT EXISTS csp_measures (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id        UUID NOT NULL REFERENCES csp_goals(id) ON DELETE CASCADE,
    code           TEXT NOT NULL,                  -- 'CH.1.1'
    name           TEXT NOT NULL,
    initial_target TEXT,                           -- '64% below 2019 levels by 2028'
    target_year    INT,                            -- parsed when present
    display_order  INT  NOT NULL DEFAULT 0,
    UNIQUE (goal_id, code)
);

COMMENT ON TABLE csp_measures IS
    'CSP Measures (~80 rows). Measures *are* the KPIs — each carries an initial target.';

CREATE INDEX IF NOT EXISTS csp_measures_goal_idx
    ON csp_measures (goal_id, display_order);
CREATE INDEX IF NOT EXISTS csp_measures_code_idx
    ON csp_measures (code);

-- ----------------------------------------------------------------------------
-- 4) Register CSP as a sibling framework alongside PPP
-- ----------------------------------------------------------------------------

INSERT INTO strategic_frameworks (code, name, description, owner_type, display_order)
VALUES (
    'CSP',
    'Citywide Strategic Plan',
    'Austin''s Citywide Strategic Plan (FY26 overview). Six strategic priorities '
    || '(Community Health & Sustainability; Economic & Workforce Development; '
    || 'High-Performing Government; Homelessness & Housing; Mobility & Critical '
    || 'Infrastructure; Public Safety) with Goals and Measures beneath each. The '
    || 'six Strategic Anchors (Equity, Affordability, Innovation, Sustainability '
    || '& Resiliency, Proactive Prevention, Community Trust & Relationships) are '
    || 'embedded throughout. CSP renders as a saved-view config over the existing '
    || 'cards.pillar column plus the new csp_goal_ids / anchor_scores metadata.',
    'org',
    2
)
ON CONFLICT (code) DO UPDATE SET
    name          = EXCLUDED.name,
    description   = EXCLUDED.description,
    owner_type    = EXCLUDED.owner_type,
    display_order = EXCLUDED.display_order;

-- ----------------------------------------------------------------------------
-- 5) framework_categories rows for CSP
-- ----------------------------------------------------------------------------
-- One row per pillar so existing PPP-style framework_categories rendering
-- works for CSP unchanged. The category code matches cards.pillar so the
-- renderer can join directly.

INSERT INTO framework_categories (framework_code, code, name, description, display_order)
VALUES
    ('CSP', 'CH', 'Community Health & Sustainability',
     'Advancing health, wellbeing, and environmental resilience.', 1),
    ('CSP', 'EW', 'Economic & Workforce Development',
     'Promoting economic mobility and workforce opportunity.', 2),
    ('CSP', 'HG', 'High-Performing Government',
     'Improving service delivery, efficiency, and organizational capacity.', 3),
    ('CSP', 'HH', 'Homelessness & Housing',
     'Expanding housing affordability and reducing homelessness.', 4),
    ('CSP', 'MC', 'Mobility & Critical Infrastructure',
     'Strengthening transportation, facilities, and utility infrastructure.', 5),
    ('CSP', 'PS', 'Public Safety',
     'Advancing equitable, effective, and resilient public safety systems.', 6)
ON CONFLICT (framework_code, code) DO UPDATE SET
    name          = EXCLUDED.name,
    description   = EXCLUDED.description,
    display_order = EXCLUDED.display_order;
