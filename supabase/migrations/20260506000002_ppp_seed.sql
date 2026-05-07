-- ============================================================================
-- PPP Framework Seed (Phase 3 of FY26 reactivation)
-- ============================================================================
-- Seeds the People · Place · Partnerships strategic framework, three
-- categories, the canonical driver list, and three organization-owned
-- workstreams.  Implements seed §4 of
-- docs/11_PRD_Scoped_Workstreams_and_Frameworks.md verbatim from Ana
-- DeFrates' May 4 2026 brief.
--
-- Idempotent: re-running the migration leaves the data in the same state.
-- All inserts use ON CONFLICT or NOT EXISTS guards.
--
-- This migration also adds drivers.tracked_metric_examples to give us
-- semantic separation between discovery search-topic seeds (kept in
-- drivers.keywords) and display strings naming the metrics each driver
-- tracks.

-- ----------------------------------------------------------------------------
-- 0) Driver schema refinement
-- ----------------------------------------------------------------------------

ALTER TABLE drivers
    ADD COLUMN IF NOT EXISTS tracked_metric_examples TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN drivers.tracked_metric_examples IS
    'Display-ready strings naming metrics this driver tracks (e.g. "rent burden").';
COMMENT ON COLUMN drivers.keywords IS
    'Discovery search-topic seed phrases (e.g. "Austin homelessness response").';

-- ----------------------------------------------------------------------------
-- 1) PPP framework
-- ----------------------------------------------------------------------------

INSERT INTO strategic_frameworks (code, name, description, owner_type, display_order)
VALUES (
    'PPP',
    'People · Place · Partnerships',
    'FY26-27 strategic framing introduced in the CMO budget message (page 15). '
    || 'Three pillars — People, Place, Partnerships — that organize how Austin '
    || 'discovers and discusses emerging signals across community wellbeing, '
    || 'climate / infrastructure, and intergovernmental capacity.',
    'org',
    1
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    owner_type = EXCLUDED.owner_type,
    display_order = EXCLUDED.display_order;

-- ----------------------------------------------------------------------------
-- 2) PPP categories
-- ----------------------------------------------------------------------------

INSERT INTO framework_categories (framework_code, code, name, description, display_order)
VALUES
    ('PPP', 'people',
     'Community Wellbeing & Social Resilience',
     'People-pillar drivers: cost of living, behavioral health & homelessness, '
     || 'youth & family needs, equity expectations.',
     1),
    ('PPP', 'place',
     'Climate, Infrastructure & Place-Based Resilience',
     'Place-pillar drivers: climate change, aging infrastructure, energy '
     || 'transition, housing & land-use pressure.',
     2),
    ('PPP', 'partnerships',
     'Intergovernmental & Civic Capacity',
     'Partnerships-pillar drivers: state/federal preemption, regional '
     || 'interdependence, grant funding availability, civic trust, economic '
     || 'competitiveness.',
     3)
ON CONFLICT (framework_code, code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order;

-- ----------------------------------------------------------------------------
-- 3) Drivers (one INSERT, joined to category id by code)
-- ----------------------------------------------------------------------------

INSERT INTO drivers (
    framework_category_id, code, name, description,
    keywords, tracked_metric_examples, display_order
)
SELECT
    fc.id, d.code, d.name, d.description,
    d.keywords, d.tracked_metric_examples, d.display_order
FROM (VALUES
    -- PEOPLE
    ('people', 'cost_of_living', 'Cost of Living',
     'Affordability pressures and assistance demand.',
     ARRAY['rent burden Austin', 'eviction filings Travis County',
           'emergency rental assistance demand'],
     ARRAY['rent burden', 'eviction filings',
           'emergency rental assistance demand',
           'shelter utilization', 'shelter waitlists'],
     1),
    ('people', 'behavioral_health_homelessness',
     'Behavioral Health & Homelessness',
     'Behavioral health workforce capacity and homelessness response.',
     ARRAY['Austin homelessness response', 'behavioral health workforce shortage'],
     ARRAY['shelter utilization', 'youth program participation',
           'community health disparities'],
     2),
    ('people', 'youth_family_needs', 'Youth & Family Needs',
     'Programming, childcare, and family support.',
     ARRAY[]::TEXT[],
     ARRAY['youth program participation', 'family wellbeing index'],
     3),
    ('people', 'equity_expectations', 'Equity Expectations',
     'Resident expectations around equitable service delivery and trust.',
     ARRAY[]::TEXT[],
     ARRAY['resident sentiment', 'trust measures'],
     4),

    -- PLACE
    ('place', 'climate_change', 'Climate Change',
     'Heat, wildfire, flood, and other climate-driven hazards.',
     ARRAY[]::TEXT[],
     ARRAY['extreme heat days', 'wildfire frequency', 'flood frequency'],
     1),
    ('place', 'aging_infrastructure', 'Aging Infrastructure',
     'Asset condition, stormwater capacity, and maintenance backlogs.',
     ARRAY[]::TEXT[],
     ARRAY['infrastructure condition ratings', 'stormwater incidents'],
     2),
    ('place', 'energy_transition', 'Energy Transition',
     'Affordability and uptake of electrification.',
     ARRAY[]::TEXT[],
     ARRAY['utility affordability', 'electrification uptake'],
     3),
    ('place', 'housing_landuse_pressure', 'Housing & Land Use Pressure',
     'Density and land-use pressure on parks and shared space.',
     ARRAY[]::TEXT[],
     ARRAY['park & field maintenance demand'],
     4),

    -- PARTNERSHIPS
    ('partnerships', 'state_federal_preemption',
     'State / Federal Preemption',
     'Legislative and regulatory shifts constraining municipal action.',
     ARRAY[]::TEXT[],
     ARRAY['legislative developments', 'regulatory developments'],
     1),
    ('partnerships', 'regional_interdependence', 'Regional Interdependence',
     'Cross-jurisdictional agreements and regional migration patterns.',
     ARRAY[]::TEXT[],
     ARRAY['interlocal agreements', 'regional migration patterns'],
     2),
    ('partnerships', 'grant_funding', 'Grant Funding Availability',
     'Federal, state, and philanthropic grant opportunity flow.',
     ARRAY[]::TEXT[],
     ARRAY['grant opportunities'],
     3),
    ('partnerships', 'civic_trust', 'Civic Trust',
     'Public engagement and trust signals.',
     ARRAY[]::TEXT[],
     ARRAY['public engagement metrics'],
     4),
    ('partnerships', 'economic_competitiveness', 'Economic Competitiveness',
     'Nonprofit / private partnership activity and regional competitiveness.',
     ARRAY[]::TEXT[],
     ARRAY['nonprofit / private partnership activity'],
     5)
) AS d(category_code, code, name, description, keywords, tracked_metric_examples, display_order)
JOIN framework_categories fc
    ON fc.framework_code = 'PPP' AND fc.code = d.category_code
ON CONFLICT (framework_category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    keywords = EXCLUDED.keywords,
    tracked_metric_examples = EXCLUDED.tracked_metric_examples,
    display_order = EXCLUDED.display_order;

-- ----------------------------------------------------------------------------
-- 4) Organization-owned workstreams (one per PPP category)
-- ----------------------------------------------------------------------------
-- Org workstreams have user_id = NULL; mutations are blocked by RLS until an
-- explicit admin layer is added (Phase 7 / S3).  Idempotent via NOT EXISTS
-- guard keyed on (owner_type='org', framework_code, framework_category_id).

INSERT INTO workstreams (
    user_id, name, description, owner_type,
    framework_code, framework_category_id,
    driver_ids, budget_relevance, purpose_statement,
    pillar_ids, goal_ids, stage_ids, horizon, keywords,
    is_active, auto_add, auto_scan,
    created_at, updated_at
)
SELECT
    NULL,
    ws.name,
    ws.description,
    'org',
    'PPP',
    fc.id,
    COALESCE(
        (SELECT ARRAY_AGG(id ORDER BY display_order)
           FROM drivers WHERE framework_category_id = fc.id),
        '{}'::UUID[]
    ),
    ws.budget_relevance,
    ws.purpose_statement,
    '{}'::TEXT[], '{}'::TEXT[], '{}'::TEXT[], 'ALL', '{}'::TEXT[],
    TRUE, FALSE, FALSE,
    NOW(), NOW()
FROM (VALUES
    ('people',
     'Community Wellbeing & Social Resilience (People)',
     'PPP People-pillar organization workstream tracking emerging conditions affecting resident wellbeing, service demand, and social stability.',
     ARRAY[
         'Homelessness services',
         'Rental assistance',
         'Public health investments',
         'Youth and family programming',
         'Equity-focused interventions'
     ],
     'Track emerging conditions affecting resident wellbeing, service demand, and social stability to inform future investments in human-centered services.'),
    ('place',
     'Climate, Infrastructure & Place-Based Resilience (Place)',
     'PPP Place-pillar organization workstream tracking environmental, infrastructure, and built-environment trends.',
     ARRAY[
         'Wildfire response / emergency management',
         'Storm drain rehabilitation',
         'Utility resilience',
         'Facility hardening',
         'Climate adaptation and mitigation'
     ],
     'Track environmental, infrastructure, and built-environment trends shaping Austin''s long-term livability and resilience.'),
    ('partnerships',
     'Intergovernmental & Civic Capacity (Partnerships)',
     'PPP Partnerships-pillar organization workstream tracking the external ecosystem affecting Austin''s ability to govern, partner, and deliver services.',
     ARRAY[
         'Intergovernmental affairs capacity',
         'Regional planning / coordination',
         'Grant leveraging',
         'Public engagement investments',
         'Partnership-based service delivery'
     ],
     'Track the evolving external ecosystem affecting Austin''s ability to govern, partner, and deliver services collaboratively.')
) AS ws(category_code, name, description, budget_relevance, purpose_statement)
JOIN framework_categories fc
    ON fc.framework_code = 'PPP' AND fc.code = ws.category_code
WHERE NOT EXISTS (
    SELECT 1 FROM workstreams w2
    WHERE w2.owner_type = 'org'
      AND w2.framework_code = 'PPP'
      AND w2.framework_category_id = fc.id
);
