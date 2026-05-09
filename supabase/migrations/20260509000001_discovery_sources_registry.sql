-- Migration: discovery_sources_registry
-- Created at: 2026-05-09
-- Phase: PR A (Admin Console — Source catalog)
--
-- PURPOSE:
--   Persist the catalog of feeds and queries that the discovery pipeline
--   scans. Today these live in code (DEFAULT_RSS_FEEDS in discovery_service.py
--   and per-category fetcher modules), so an operator cannot enable, disable,
--   add, or remove a feed without redeploying. This table makes the catalog
--   editable from the admin console.
--
-- RELATED:
--   - Domain blocklisting stays in `domain_reputation` (curated_tier=NULL +
--     is_active=FALSE) — we do NOT duplicate that surface here.
--   - Per-source health is computed live from `discovered_sources`; this
--     table only stores the canonical entry + last_success/failure tracking.
--
-- SCOPE OF WHAT THE PIPELINE READS TODAY (v1):
--   - RSS feeds: yes, the fetcher reads `category='rss', enabled=TRUE` rows.
--   - news / academic / government / tech_blog / web_search: rows accepted
--     but the existing fetchers continue to use their hardcoded query lists.
--     These categories are listed for visibility / future PR A2.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trigger_dsr_updated_at ON discovery_sources_registry;
--   DROP INDEX IF EXISTS idx_dsr_category_enabled;
--   DROP TABLE IF EXISTS discovery_sources_registry;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.discovery_sources_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source category. Mirrors SourceCategory enum values in discovery_service.py
    -- plus 'web_search' for SearXNG / Serper query templates.
    category TEXT NOT NULL CHECK (
        category IN ('rss', 'news', 'academic', 'government', 'tech_blog', 'web_search')
    ),

    -- Human label shown in the admin UI.
    name TEXT NOT NULL,

    -- For RSS / news / academic / etc.: the feed or domain URL.
    -- For web_search: nullable; the query template lives in `config.query`.
    url TEXT,

    -- Category-specific settings. Examples:
    --   {"keywords": ["austin", "smart city"]}
    --   {"query": "site:austintexas.gov", "max_results": 20}
    config JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Operator toggles. `enabled=FALSE` means the fetcher must skip this row.
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Selection multiplier (0.0 – 10.0). v1 reading: feeds with weight >= 1
    -- are pulled normally; weight < 1 shrinks the per-feed cap, weight > 1
    -- expands it. Stored even when the fetcher does not yet honor it so we
    -- don't have to backfill defaults later.
    weight REAL NOT NULL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 10),

    notes TEXT,

    -- Per-source health state. Updated by the fetcher after each scan;
    -- never set by the admin UI directly.
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_failure_reason TEXT,

    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Allow multiple NULL urls (web_search rows) but reject duplicate
    -- (category, url) pairs.
    UNIQUE (category, url)
);

CREATE INDEX IF NOT EXISTS idx_dsr_category_enabled
    ON public.discovery_sources_registry (category, enabled);

ALTER TABLE public.discovery_sources_registry ENABLE ROW LEVEL SECURITY;

-- Authenticated users can READ the catalog so the admin console works for
-- any admin without needing service-role on the client. Mutations go through
-- the FastAPI service (which uses SUPABASE_SERVICE_KEY) and are gated by
-- require_admin().
DROP POLICY IF EXISTS dsr_authenticated_read ON public.discovery_sources_registry;
CREATE POLICY dsr_authenticated_read
    ON public.discovery_sources_registry FOR SELECT
    TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS dsr_service_role_all ON public.discovery_sources_registry;
CREATE POLICY dsr_service_role_all
    ON public.discovery_sources_registry FOR ALL
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- Reuse the shared updated_at trigger function (defined in 001_complete_schema.sql).
DROP TRIGGER IF EXISTS trigger_dsr_updated_at ON public.discovery_sources_registry;
CREATE TRIGGER trigger_dsr_updated_at
    BEFORE UPDATE ON public.discovery_sources_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Seed the four RSS feeds currently hardcoded as DEFAULT_RSS_FEEDS so the
-- discovery pipeline keeps fetching the same sources on day-zero. ON CONFLICT
-- DO NOTHING means a re-run of this migration is safe.
INSERT INTO public.discovery_sources_registry (category, name, url, enabled, notes)
VALUES
    ('rss', 'Hacker News',                'https://news.ycombinator.com/rss',                       TRUE, 'Tech community headlines'),
    ('rss', 'Ars Technica – Technology',  'https://feeds.arstechnica.com/arstechnica/technology-lab', TRUE, 'Deep technology coverage'),
    ('rss', 'GovTech',                    'https://www.govtech.com/rss/',                            TRUE, 'State/local government tech news'),
    ('rss', 'StateScoop',                 'https://statescoop.com/feed/',                            TRUE, 'State agency tech news')
ON CONFLICT (category, url) DO NOTHING;

COMMENT ON TABLE public.discovery_sources_registry IS
    'Editable catalog of discovery pipeline feeds and queries. v1: RSS rows are read by the fetcher; other categories are display-only until PR A2.';
COMMENT ON COLUMN public.discovery_sources_registry.weight IS
    'Selection multiplier 0–10. v1: scales the per-feed cap (weight 0.5 = half items, 2.0 = double, capped by max_sources_per_query).';
COMMENT ON COLUMN public.discovery_sources_registry.last_success_at IS
    'Set by the fetcher after a successful scan. Read-only from the admin console.';
