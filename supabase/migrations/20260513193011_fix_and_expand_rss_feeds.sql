-- Migration: fix_and_expand_rss_feeds
-- Created at: 2026-05-13
--
-- PURPOSE:
--   Five feeds in our existing seeds (rss_feeds + discovery_sources_registry)
--   are broken — either 404, redirect-to-404, return 200 with an empty
--   <channel>, or return 200 with HTML instead of RSS. None of these failure
--   modes are caught by the fetcher's HTTP error handling, so they silently
--   produce zero discovered articles. This migration corrects the URLs and
--   adds 10 new feeds that fill known gaps (Austin-local coverage, MC, HH).
--
-- VERIFICATION (every URL below was verified before this migration shipped):
--   - HEAD probe returns 200 with Content-Type containing 'xml'
--   - GET body parses as valid RSS/Atom and contains at least one <item> or
--     <entry> element
--   See PR description for the curl commands and outputs.
--
-- FIXES (5):
--   Pew Trusts:    pewtrusts.org/en/rss/all   -> pewresearch.org/feed/
--                  (pewtrusts.org redirects to pew.org which 404s on every
--                  feed path. Pew Charitable Trusts no longer publishes RSS;
--                  Pew Research Center is the closest credible substitute.)
--   ICMA:          icma.org/feed              -> icma.org/rss.xml
--                  (rss.xml is the URL ICMA itself advertises; matches the
--                  URL already used in 20260512000005_..._public_safety_feeds.)
--   City of Austin: austintexas.gov/rss.xml   -> austintexas.gov/site/news/rss.xml
--                  (the old URL returns 200 with an empty <channel> body;
--                  the /site/news/rss.xml path returns real press releases.)
--   GovTech:       govtech.com/rss            -> govtech.com/index.rss
--                  (the old URL returns 200 with HTML; /index.rss matches
--                  the <link rel="alternate"> tag on the GovTech homepage.)
--   Brookings:     brookings.edu/feed/        -> brookings.edu/feed/atom/
--                  (the old URL 200s with HTML due to a vary-cache quirk on
--                  /feed/; /feed/atom/ serves clean application/atom+xml.)
--
-- EXPANSION (10 new feeds aligned with Austin's strategic pillars):
--   Austin-local (cross-pillar):
--     - Austin Monitor       (austinmonitor.com/feed/)
--     - KUT                  (kut.org/news.rss)
--   Mobility & Critical Infrastructure (MC):
--     - Smart Cities Dive    (smartcitiesdive.com/feeds/news/)
--     - Streetsblog USA      (usa.streetsblog.org/feed)
--     - NACTO                (nacto.org/feed/)
--   Homelessness & Housing (HH):
--     - NLIHC                (nlihc.org/rss.xml)
--   Cross-pillar think-tanks:
--     - Aspen Institute      (aspeninstitute.org/feed/)
--     - RAND blog            (rand.org/blog.xml)
--     - Pew Research short reads (pewresearch.org/short-reads/feed/)
--   High-Performing Government (HG):
--     - Government Executive (govexec.com/rss/all/)
--
-- IDEMPOTENCY:
--   - URL fixes use UPDATE on `rss_feeds.url` and `discovery_sources_registry.url`.
--   - New rows use ON CONFLICT (...) DO NOTHING.
--   Re-running is safe.
--
-- ROLLBACK:
--   -- revert rss_feeds URL updates
--   UPDATE rss_feeds SET url = 'https://www.pewtrusts.org/en/rss/all'
--     WHERE url = 'https://www.pewresearch.org/feed/' AND name = 'Pew Trusts';
--   UPDATE rss_feeds SET url = 'https://icma.org/feed'                 WHERE url = 'https://icma.org/rss.xml'              AND name = 'ICMA';
--   UPDATE rss_feeds SET url = 'https://www.austintexas.gov/rss.xml'   WHERE url = 'https://www.austintexas.gov/site/news/rss.xml' AND name = 'City of Austin';
--   UPDATE rss_feeds SET url = 'https://www.govtech.com/rss'           WHERE url = 'https://www.govtech.com/index.rss'    AND name = 'GovTech';
--   UPDATE rss_feeds SET url = 'https://www.brookings.edu/feed/'       WHERE url = 'https://www.brookings.edu/feed/atom/' AND name = 'Brookings Institution';
--   -- delete new rss_feeds rows
--   DELETE FROM rss_feeds WHERE url IN (
--     'https://www.austinmonitor.com/feed/', 'https://www.kut.org/news.rss',
--     'https://smartcitiesdive.com/feeds/news/', 'https://usa.streetsblog.org/feed',
--     'https://nacto.org/feed/', 'https://nlihc.org/rss.xml',
--     'https://www.aspeninstitute.org/feed/', 'https://www.rand.org/blog.xml',
--     'https://www.pewresearch.org/short-reads/feed/', 'https://www.govexec.com/rss/all/'
--   );
--   -- delete new discovery_sources_registry rows (same URLs)
--   DELETE FROM discovery_sources_registry WHERE category = 'rss' AND url IN (
--     'https://www.austinmonitor.com/feed/', 'https://www.kut.org/news.rss',
--     'https://smartcitiesdive.com/feeds/news/', 'https://usa.streetsblog.org/feed',
--     'https://nacto.org/feed/', 'https://nlihc.org/rss.xml',
--     'https://www.aspeninstitute.org/feed/', 'https://www.rand.org/blog.xml',
--     'https://www.pewresearch.org/short-reads/feed/', 'https://www.govexec.com/rss/all/'
--   );
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1: Fix broken URLs in `rss_feeds`
-- ---------------------------------------------------------------------------
-- For each fix we also reset error_count / last_error so the worker doesn't
-- keep the row in a paused/error state on its next pass.

UPDATE public.rss_feeds
SET url           = 'https://www.pewresearch.org/feed/',
    name          = 'Pew Research Center',
    status        = 'active',
    error_count   = 0,
    last_error    = NULL,
    next_check_at = NOW(),
    updated_at    = NOW()
WHERE url = 'https://www.pewtrusts.org/en/rss/all';

UPDATE public.rss_feeds
SET url           = 'https://icma.org/rss.xml',
    status        = 'active',
    error_count   = 0,
    last_error    = NULL,
    next_check_at = NOW(),
    updated_at    = NOW()
WHERE url = 'https://icma.org/feed';

UPDATE public.rss_feeds
SET url           = 'https://www.austintexas.gov/site/news/rss.xml',
    status        = 'active',
    error_count   = 0,
    last_error    = NULL,
    next_check_at = NOW(),
    updated_at    = NOW()
WHERE url = 'https://www.austintexas.gov/rss.xml';

UPDATE public.rss_feeds
SET url           = 'https://www.govtech.com/index.rss',
    status        = 'active',
    error_count   = 0,
    last_error    = NULL,
    next_check_at = NOW(),
    updated_at    = NOW()
WHERE url = 'https://www.govtech.com/rss';

UPDATE public.rss_feeds
SET url           = 'https://www.brookings.edu/feed/atom/',
    status        = 'active',
    error_count   = 0,
    last_error    = NULL,
    next_check_at = NOW(),
    updated_at    = NOW()
WHERE url = 'https://www.brookings.edu/feed/';

-- ---------------------------------------------------------------------------
-- Part 2: Add new feeds to `rss_feeds`
-- ---------------------------------------------------------------------------

INSERT INTO public.rss_feeds (url, name, category) VALUES
    ('https://www.austinmonitor.com/feed/',            'Austin Monitor',            'municipal'),
    ('https://www.kut.org/news.rss',                   'KUT (Austin NPR)',          'news'),
    ('https://smartcitiesdive.com/feeds/news/',        'Smart Cities Dive',         'gov_tech'),
    ('https://usa.streetsblog.org/feed',               'Streetsblog USA',           'news'),
    ('https://nacto.org/feed/',                        'NACTO',                     'municipal'),
    ('https://nlihc.org/rss.xml',                      'NLIHC',                     'think_tank'),
    ('https://www.aspeninstitute.org/feed/',           'Aspen Institute',           'think_tank'),
    ('https://www.rand.org/blog.xml',                  'RAND Corporation',          'think_tank'),
    ('https://www.pewresearch.org/short-reads/feed/',  'Pew Research Short Reads',  'think_tank'),
    ('https://www.govexec.com/rss/all/',               'Government Executive',      'gov_tech')
ON CONFLICT (url) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Part 3: Fix the broken ICMA URL in `discovery_sources_registry`
-- ---------------------------------------------------------------------------
-- This is the only fix needed here: the registry already used icma.org/rss.xml
-- in the 20260512000005 seed migration, but if any environment was bootstrapped
-- earlier with icma.org/feed we update it here. UPDATE is a no-op on envs that
-- already have the correct value.

UPDATE public.discovery_sources_registry
SET url        = 'https://icma.org/rss.xml',
    enabled    = TRUE,
    last_failure_at     = NULL,
    last_failure_reason = NULL,
    updated_at = NOW()
WHERE category = 'rss' AND url = 'https://icma.org/feed';

-- ---------------------------------------------------------------------------
-- Part 4: Add the same 10 new feeds to `discovery_sources_registry`
-- ---------------------------------------------------------------------------
-- Mirrors the rss_feeds additions so the admin console + balancer can see
-- them. Keep enabled=TRUE so the discovery pipeline picks them up immediately.

INSERT INTO public.discovery_sources_registry (category, name, url, enabled, notes)
VALUES
    ('rss', 'Austin Monitor',            'https://www.austinmonitor.com/feed/',           TRUE, 'Austin-local: municipal government beat reporting (Council, planning, land use)'),
    ('rss', 'KUT (Austin NPR)',          'https://www.kut.org/news.rss',                  TRUE, 'Austin-local: NPR affiliate, local + Texas politics'),
    ('rss', 'Smart Cities Dive',         'https://smartcitiesdive.com/feeds/news/',       TRUE, 'MC: smart-city tech, infrastructure, urban planning'),
    ('rss', 'Streetsblog USA',           'https://usa.streetsblog.org/feed',              TRUE, 'MC: transportation policy, active mobility, transit'),
    ('rss', 'NACTO',                     'https://nacto.org/feed/',                       TRUE, 'MC: National Assoc. of City Transportation Officials — street design + transit policy'),
    ('rss', 'NLIHC',                     'https://nlihc.org/rss.xml',                     TRUE, 'HH: National Low Income Housing Coalition — affordable-housing policy'),
    ('rss', 'Aspen Institute',           'https://www.aspeninstitute.org/feed/',          TRUE, 'Think-tank: cross-pillar policy, economy, society'),
    ('rss', 'RAND Corporation',          'https://www.rand.org/blog.xml',                 TRUE, 'Think-tank: cross-pillar policy research blog'),
    ('rss', 'Pew Research Short Reads',  'https://www.pewresearch.org/short-reads/feed/', TRUE, 'Think-tank: short analytical pieces from Pew Research'),
    ('rss', 'Government Executive',      'https://www.govexec.com/rss/all/',              TRUE, 'HG: federal + state/local government management')
ON CONFLICT (category, url) DO NOTHING;
