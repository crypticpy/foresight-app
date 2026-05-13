-- Migration: pattern_v2_foundation
--
-- PURPOSE:
--   Stand up the entity layer that Pattern Detection v2 reads from. PR-1 is
--   substrate-only — no scheduler hook, no candidate generation, no judge.
--   The existing v1 cosine detector keeps running unchanged.
--
-- TABLES ADDED:
--   * entities             — canonical concept rows, scoped per prompt_version.
--                            Has a pgvector(1536) embedding so reconciliation
--                            can do cosine lookups against new canonical names.
--   * entity_aliases       — every observed surface form for an entity.
--                            Reconciliation uses alias-string overlap as a
--                            second gate on top of cosine to avoid the
--                            "ada-002 is too generous on near-synonyms"
--                            failure mode flagged in the design review.
--   * entity_mentions      — flat, denormalized per-item mention table that
--                            Modes A/B/C in PR-3/PR-4 will scan. Carries the
--                            extracted canonical_name + entity_type so the
--                            row is meaningful BEFORE reconciliation fills in
--                            entity_id (two-phase write).
--
-- COLUMNS ADDED:
--   * cards.concept_tags          (JSONB, default '[]')
--   * cards.concept_tags_version  (TEXT, NULL until first extraction)
--
-- FUNCTION ADDED:
--   * match_entities(query_embedding, prompt_version, threshold, limit)
--       Vector similarity lookup used by entity_reconciliation_service.
--       Returns candidate entity rows above the cosine threshold for a
--       given prompt_version scope; the service then applies alias-overlap
--       on top.
--
-- IDEMPOTENCY:
--   IF NOT EXISTS on every CREATE / ADD COLUMN / CREATE INDEX. Trigger
--   function uses CREATE OR REPLACE and a DROP TRIGGER IF EXISTS guard so
--   re-applies are no-ops.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.entity_mentions;
--   DROP TABLE IF EXISTS public.entity_aliases;
--   DROP TABLE IF EXISTS public.entities;
--   ALTER TABLE public.cards DROP COLUMN IF EXISTS concept_tags;
--   ALTER TABLE public.cards DROP COLUMN IF EXISTS concept_tags_version;
--   DROP FUNCTION IF EXISTS public.match_entities(
--       extensions.vector, text, double precision, integer);
--   DROP FUNCTION IF EXISTS public.update_entities_updated_at();
-- ============================================================================

-- Ensure pgvector is available (existing migrations install it under the
-- `extensions` schema; we mirror their CREATE EXTENSION guard).
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- cards.concept_tags
-- ---------------------------------------------------------------------------
ALTER TABLE public.cards
    ADD COLUMN IF NOT EXISTS concept_tags JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.cards
    ADD COLUMN IF NOT EXISTS concept_tags_version TEXT;

COMMENT ON COLUMN public.cards.concept_tags IS
    'LLM-extracted concept tags per Pattern Detection v2 extraction prompt. Array of {canonical, aliases, type, salience, stance}. Populated lazily by entity_extraction_service.';
COMMENT ON COLUMN public.cards.concept_tags_version IS
    'Extraction prompt version that produced concept_tags. NULL until first extraction; mismatch with EXTRACTION_PROMPT_VERSION queues the card for re-tagging.';

-- Partial index — "find rows due for (re-)tagging" is the hottest query
-- the backfill script will run. Includes NULL rows by virtue of the
-- predicate. Only used by the backfill so we keep it narrow.
CREATE INDEX IF NOT EXISTS cards_concept_tags_version_pending
    ON public.cards (id)
    WHERE concept_tags_version IS NULL;

-- ---------------------------------------------------------------------------
-- entities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entities (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name       TEXT NOT NULL,
    entity_type          TEXT NOT NULL CHECK (entity_type IN (
                            'person','org','program','tech','place','policy','event','other'
                         )),
    canonical_embedding  extensions.vector(1536),
    prompt_version       TEXT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent merge-or-create: a (canonical, type, version) tuple resolves
-- to at most one row. Case-folded so "Agentic AI" and "agentic AI" collide.
CREATE UNIQUE INDEX IF NOT EXISTS entities_canonical_type_version_unique
    ON public.entities (lower(canonical_name), entity_type, prompt_version);

-- ivfflat index for the cosine lookup. lists=100 is the Supabase default
-- for tables in the low-thousands row range; revisit if entities grows
-- past ~50k rows.
CREATE INDEX IF NOT EXISTS entities_canonical_embedding_ivfflat
    ON public.entities
    USING ivfflat (canonical_embedding extensions.vector_cosine_ops)
    WITH (lists = 100);

COMMENT ON TABLE public.entities IS
    'Pattern Detection v2 canonical entities. Scoped per prompt_version so a prompt bump produces a parallel vocabulary that the detector keeps separate until cutover.';

-- ---------------------------------------------------------------------------
-- entity_aliases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id       UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    alias           TEXT NOT NULL,
    prompt_version  TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_aliases_entity_alias_unique
    ON public.entity_aliases (entity_id, lower(alias));

CREATE INDEX IF NOT EXISTS entity_aliases_alias_lower
    ON public.entity_aliases (lower(alias));

COMMENT ON TABLE public.entity_aliases IS
    'Observed surface forms for each canonical entity. Reconciliation uses lower-cased alias overlap as a hard gate on top of cosine similarity to avoid over-merging near-synonyms.';

-- ---------------------------------------------------------------------------
-- entity_mentions
-- ---------------------------------------------------------------------------
-- Carries canonical_name + entity_type so the row is queryable BEFORE
-- entity_id is filled in by reconciliation. PR-2 will start populating
-- story_cluster_id + sqi for source mentions; cards leave them NULL.
CREATE TABLE IF NOT EXISTS public.entity_mentions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The mention as extracted; reconciliation later updates entity_id.
    canonical_name    TEXT NOT NULL,
    entity_type       TEXT NOT NULL CHECK (entity_type IN (
                          'person','org','program','tech','place','policy','event','other'
                      )),
    entity_id         UUID REFERENCES public.entities(id) ON DELETE CASCADE,

    -- Heterogeneous link; item_type discriminates between cards and sources.
    item_id           UUID NOT NULL,
    item_type         TEXT NOT NULL CHECK (item_type IN ('card','source')),

    -- Denormalized fields for windowed detector queries.
    pillar_id         TEXT,
    story_cluster_id  UUID,
    sqi               REAL,
    stance            TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (stance IN ('support','oppose','neutral','unknown')),
    salience          REAL NOT NULL
                      CHECK (salience >= 0.0 AND salience <= 1.0),
    item_created_at   TIMESTAMPTZ NOT NULL,
    prompt_version    TEXT NOT NULL,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (item, canonical_name, type, prompt_version). canonical_name
-- is the natural key here, not entity_id — entity_id is NULL during the
-- pending phase between extraction and reconciliation.
CREATE UNIQUE INDEX IF NOT EXISTS entity_mentions_natural_key_unique
    ON public.entity_mentions
       (item_id, item_type, lower(canonical_name), entity_type, prompt_version);

-- Primary window scan (Mode B per-window aggregation in PR-3).
CREATE INDEX IF NOT EXISTS entity_mentions_window
    ON public.entity_mentions
       (prompt_version, item_type, item_created_at DESC);

-- Per-pillar share computations (Mode A breadth + Mode B per-pillar lift).
CREATE INDEX IF NOT EXISTS entity_mentions_pillar
    ON public.entity_mentions
       (prompt_version, pillar_id, item_created_at DESC);

-- Entity-history lookup (suppression window in PR-3, judge evidence
-- selection in PR-3, Mode C co-occurrence in PR-4).
CREATE INDEX IF NOT EXISTS entity_mentions_entity
    ON public.entity_mentions
       (prompt_version, entity_id, item_created_at DESC);

-- Reconciliation-pending scan ("show me mentions still missing entity_id").
CREATE INDEX IF NOT EXISTS entity_mentions_pending
    ON public.entity_mentions (prompt_version)
    WHERE entity_id IS NULL;

COMMENT ON TABLE public.entity_mentions IS
    'Flat per-item entity mention table backing Pattern Detection v2 candidate generation. Carries the extracted canonical_name so the row is meaningful before reconciliation populates entity_id.';

-- ---------------------------------------------------------------------------
-- RLS — mirror pattern_insights: authenticated read, service-role full
-- ---------------------------------------------------------------------------
ALTER TABLE public.entities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_aliases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_mentions   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'entities'
          AND policyname = 'Authenticated users can read entities'
    ) THEN
        CREATE POLICY "Authenticated users can read entities"
            ON public.entities FOR SELECT
            USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'entities'
          AND policyname = 'Service role manages entities'
    ) THEN
        CREATE POLICY "Service role manages entities"
            ON public.entities FOR ALL
            USING (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'entity_aliases'
          AND policyname = 'Authenticated users can read entity aliases'
    ) THEN
        CREATE POLICY "Authenticated users can read entity aliases"
            ON public.entity_aliases FOR SELECT
            USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'entity_aliases'
          AND policyname = 'Service role manages entity aliases'
    ) THEN
        CREATE POLICY "Service role manages entity aliases"
            ON public.entity_aliases FOR ALL
            USING (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'entity_mentions'
          AND policyname = 'Authenticated users can read entity mentions'
    ) THEN
        CREATE POLICY "Authenticated users can read entity mentions"
            ON public.entity_mentions FOR SELECT
            USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'entity_mentions'
          AND policyname = 'Service role manages entity mentions'
    ) THEN
        CREATE POLICY "Service role manages entity mentions"
            ON public.entity_mentions FOR ALL
            USING (auth.role() = 'service_role');
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger for entities — mirror update_pattern_insights_updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_entities_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entities_updated_at ON public.entities;
CREATE TRIGGER entities_updated_at
    BEFORE UPDATE ON public.entities
    FOR EACH ROW
    EXECUTE FUNCTION public.update_entities_updated_at();

-- Lock down execute on the SECURITY DEFINER trigger — same posture as
-- the other trigger functions per 20260512000004_revoke_security_definer_from_public.
REVOKE EXECUTE ON FUNCTION public.update_entities_updated_at() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- match_entities — pgvector similarity lookup for reconciliation
-- ---------------------------------------------------------------------------
-- Returns up to `match_limit` rows whose canonical_embedding is within the
-- threshold for the given prompt_version. Cosine similarity rendered as
-- (1 - cosine distance) so callers get a 0..1 score with higher = closer.
-- The service applies alias-overlap on the returned candidates before
-- committing a merge.
CREATE OR REPLACE FUNCTION public.match_entities(
    query_embedding extensions.vector(1536),
    target_prompt_version TEXT,
    match_threshold DOUBLE PRECISION DEFAULT 0.85,
    match_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    canonical_name TEXT,
    entity_type TEXT,
    similarity DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.canonical_name,
        e.entity_type,
        (1.0 - (e.canonical_embedding <=> query_embedding))::double precision AS similarity
    FROM public.entities e
    WHERE e.prompt_version = target_prompt_version
      AND e.canonical_embedding IS NOT NULL
      AND (1.0 - (e.canonical_embedding <=> query_embedding)) >= match_threshold
    ORDER BY e.canonical_embedding <=> query_embedding
    LIMIT match_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.match_entities(
    extensions.vector, TEXT, DOUBLE PRECISION, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_entities(
    extensions.vector, TEXT, DOUBLE PRECISION, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.match_entities IS
    'Reconciliation cosine lookup for entity_reconciliation_service. Scoped per prompt_version so v1 and v2 vocabularies stay isolated during a prompt-version cutover.';

-- ---------------------------------------------------------------------------
-- VERIFICATION
-- ---------------------------------------------------------------------------
SELECT 'pattern_v2_foundation migration applied' AS status;
