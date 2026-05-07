-- ============================================================================
-- Drop "Future of " prefix from PPP framework category + org workstream names
-- ============================================================================
-- The original PPP seed (20260506000002_ppp_seed.sql) prefixed each category
-- and org workstream with "Future of ". Foresight is already a future-oriented
-- product, so the prefix is redundant. This migration normalizes the display
-- names. Idempotent: only updates rows still carrying the old prefix.

UPDATE framework_categories
SET name = 'Community Wellbeing & Social Resilience'
WHERE framework_code = 'PPP'
  AND code = 'people'
  AND name = 'Future of Community Wellbeing & Social Resilience';

UPDATE framework_categories
SET name = 'Climate, Infrastructure & Place-Based Resilience'
WHERE framework_code = 'PPP'
  AND code = 'place'
  AND name = 'Future of Climate, Infrastructure & Place-Based Resilience';

UPDATE framework_categories
SET name = 'Intergovernmental & Civic Capacity'
WHERE framework_code = 'PPP'
  AND code = 'partnerships'
  AND name = 'Future of Intergovernmental & Civic Capacity';

UPDATE workstreams
SET name = 'Community Wellbeing & Social Resilience (People)'
WHERE owner_type = 'org'
  AND framework_code = 'PPP'
  AND name = 'Future of Community Wellbeing & Social Resilience (People)';

UPDATE workstreams
SET name = 'Climate, Infrastructure & Place-Based Resilience (Place)'
WHERE owner_type = 'org'
  AND framework_code = 'PPP'
  AND name = 'Future of Climate, Infrastructure & Place-Based Resilience (Place)';

UPDATE workstreams
SET name = 'Intergovernmental & Civic Capacity (Partnerships)'
WHERE owner_type = 'org'
  AND framework_code = 'PPP'
  AND name = 'Future of Intergovernmental & Civic Capacity (Partnerships)';
