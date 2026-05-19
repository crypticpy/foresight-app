-- Community-tag retrieval leg for the RAG engine (PR 6).
--
-- `tag_match_cards(p_query, p_limit, p_similarity_threshold)` lets the chat
-- pipeline surface cards whose community-applied tag labels fuzzy-match the
-- user's question, even when FTS + vector both miss. Example: a user asks
-- "what's happening with climate?" — the tag dictionary has a "Climate
-- Resilience" tag applied to several cards by reviewers, but FTS hits on
-- the word "climate" in card name/summary may not surface all of them.
-- pg_trgm similarity on the tag label is exactly the right signal here.
--
-- Why a separate RPC instead of folding tags into hybrid_search_cards.search_vector:
--   - Tags are user-curated noise that shouldn't change the FTS scoring weights.
--   - Tag changes happen on the card_tags junction; we'd need a maintenance
--     trigger on a join table to refresh search_vector on the parent row,
--     which is fragile and doubles every tag insert/delete.
--   - Keeping the leg additive lets the rag_engine merge results with its own
--     fusion rules and attach `matched_tags` for downstream LLM context.
--
-- The function returns the same card column set as hybrid_search_cards so the
-- Python pipeline can treat tag-matched rows as just-another-retrieval-leg.
-- pg_trgm is already enabled by the original card_tags migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.tag_match_cards(
    p_query TEXT,
    p_limit INT DEFAULT 10,
    p_similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    card_id UUID,
    name TEXT,
    slug TEXT,
    summary TEXT,
    description TEXT,
    pillar_id TEXT,
    horizon TEXT,
    stage_id TEXT,
    impact_score NUMERIC,
    relevance_score NUMERIC,
    velocity_score NUMERIC,
    risk_score INTEGER,
    signal_quality_score INTEGER,
    matched_tag_labels TEXT[],
    tag_match_score FLOAT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = extensions, public
AS $$
    WITH matching_tags AS (
        -- Trigram similarity against both label and slug so "ai-bias" and
        -- "AI bias" both match a user query of "AI bias".
        SELECT
            t.id AS tag_id,
            t.label,
            GREATEST(similarity(t.label, p_query), similarity(t.slug, p_query))
                AS sim
        FROM public.tags t
        WHERE GREATEST(similarity(t.label, p_query), similarity(t.slug, p_query))
              >= p_similarity_threshold
    ),
    tagged_cards AS (
        -- Aggregate across (card, tag) — a card matched via multiple tags
        -- keeps the strongest similarity and accumulates the label list.
        SELECT
            ct.card_id,
            array_agg(DISTINCT mt.label ORDER BY mt.label) AS matched_tag_labels,
            MAX(mt.sim)::FLOAT AS tag_match_score
        FROM matching_tags mt
        JOIN public.card_tags ct ON ct.tag_id = mt.tag_id
        GROUP BY ct.card_id
    )
    SELECT
        c.id AS card_id,
        c.name,
        c.slug,
        c.summary,
        c.description,
        c.pillar_id,
        c.horizon,
        c.stage_id,
        c.impact_score,
        c.relevance_score,
        c.velocity_score,
        c.risk_score,
        c.signal_quality_score,
        tc.matched_tag_labels,
        tc.tag_match_score
    FROM tagged_cards tc
    JOIN public.cards c
      ON c.id = tc.card_id
     AND c.status = 'active'
    ORDER BY tc.tag_match_score DESC, c.updated_at DESC NULLS LAST
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.tag_match_cards(TEXT, INT, FLOAT)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.tag_match_cards IS
    'Community-tag retrieval leg for RAG. Fuzzy-matches the chat query '
    'against tag labels/slugs via pg_trgm similarity, then returns active '
    'cards tagged with any matching tag plus the matched-tag label set. '
    'Returns the same column shape as hybrid_search_cards so the Python '
    'pipeline can merge results as a parallel retrieval source.';

COMMIT;
