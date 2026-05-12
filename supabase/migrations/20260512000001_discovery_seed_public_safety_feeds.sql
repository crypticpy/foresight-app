-- Migration: discovery_seed_public_safety_feeds
--
-- PURPOSE:
--   Seed the discovery_sources_registry with RSS feeds that cover the
--   Public Safety pillar, animal services, and municipal-government topics.
--   The original seed (20260509000001_discovery_sources_registry.sql) only
--   ships tech feeds (Hacker News, Ars Technica, GovTech, StateScoop) so
--   the discovery pipeline can't surface PS or animal-services signals via
--   RSS even when the balancer asks for them.
--
-- VERIFICATION:
--   Each URL was HEAD-probed before this migration was written and returned
--   200 OK with an RSS/XML content-type. Re-probe before re-running if
--   you suspect a feed has moved.
--
-- IDEMPOTENCY:
--   ON CONFLICT (category, url) DO NOTHING — running this migration twice
--   leaves the registry unchanged. The unique index lives in
--   20260509000001_discovery_sources_registry.sql.
--
-- ROLLBACK:
--   DELETE FROM public.discovery_sources_registry
--   WHERE category = 'rss'
--     AND url IN (
--       'https://police1.com/news.rss',
--       'https://firerescue1.com/news.rss',
--       'https://ems1.com/news.rss',
--       'https://www.govtech.com/security.rss',
--       'https://www.aspca.org/rss.xml',
--       'https://www.nacanet.org/feed/',
--       'https://icma.org/rss.xml',
--       'https://www.nlc.org/feed/',
--       'https://www.route-fifty.com/rss/all/'
--     );
-- ============================================================================

INSERT INTO public.discovery_sources_registry (category, name, url, enabled, notes)
VALUES
    -- Public Safety (Lexipol-operated trade feeds; Lexipol publishes ~5-15 items/day)
    ('rss', 'Police1 — Daily News',         'https://police1.com/news.rss',         TRUE, 'Public Safety: law enforcement trade news'),
    ('rss', 'FireRescue1 — Daily News',     'https://firerescue1.com/news.rss',     TRUE, 'Public Safety: fire service trade news'),
    ('rss', 'EMS1 — Daily News',            'https://ems1.com/news.rss',            TRUE, 'Public Safety: EMS / emergency-medical trade news'),
    ('rss', 'GovTech — Security',           'https://www.govtech.com/security.rss', TRUE, 'Public Safety: state/local cybersecurity & physical security'),
    -- Animal services (no dedicated pillar in taxonomy; reaches PS-adjacent
    -- via animal-control / cruelty-investigation overlap).
    ('rss', 'ASPCA',                        'https://www.aspca.org/rss.xml',        TRUE, 'Animal services: ASPCA news, policy, and welfare programs'),
    ('rss', 'NACA — Animal Care & Control', 'https://www.nacanet.org/feed/',        TRUE, 'Animal services: municipal animal-control association'),
    -- Municipal-government generalists (cross-pillar; useful for HG/MC/HH coverage)
    ('rss', 'ICMA',                         'https://icma.org/rss.xml',             TRUE, 'Municipal: International City/County Management Association'),
    ('rss', 'National League of Cities',    'https://www.nlc.org/feed/',            TRUE, 'Municipal: NLC policy + city-government news'),
    ('rss', 'Route Fifty',                  'https://www.route-fifty.com/rss/all/', TRUE, 'Municipal: state and local government coverage')
ON CONFLICT (category, url) DO NOTHING;
