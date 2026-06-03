-- ============================================================================
-- Exclude orphaned (card-less) sources from global hybrid search.
--
-- WHY: hybrid_search_sources LEFT JOINs cards and, in the global branch
-- (scope_card_ids IS NULL), never required s.card_id IS NOT NULL. A source row
-- with card_id = NULL is dangling — it supports no visible card — so surfacing
-- it as RAG context produces a sourceless, un-navigable citation in chat.
--
-- This became material when the signal-source-link repair (signal-agent
-- batch-local index scramble, PR #255) re-homed each source to its correct
-- card and unlinked the surplus/duplicate rows by setting card_id = NULL
-- instead of DELETEing them (card_timeline.triggered_by_source_id has no
-- ON DELETE rule, so a hard delete would fail). Those unlinked rows must not
-- reappear in chat.
--
-- The two added predicates only affect the global branch: a scoped search
-- already constrains s.card_id = ANY(scope_card_ids), which implies NOT NULL.
-- Everything else (RRF fusion, weights, search_path, grants) is unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION hybrid_search_sources(
  query_text TEXT,
  query_embedding extensions.vector(1536),
  match_count INT DEFAULT 20,
  fts_weight FLOAT DEFAULT 1.0,
  vector_weight FLOAT DEFAULT 1.0,
  rrf_k INT DEFAULT 60,
  scope_card_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  card_id UUID,
  card_name TEXT,
  card_slug TEXT,
  title TEXT,
  url TEXT,
  ai_summary TEXT,
  key_excerpts TEXT[],
  published_date TIMESTAMPTZ,
  full_text TEXT,
  fts_rank REAL,
  vector_similarity FLOAT,
  rrf_score FLOAT
)
LANGUAGE sql STABLE
SET search_path = extensions, public
AS $$
  WITH fts_results AS (
    -- Full-text search leg
    SELECT
      s.id,
      ts_rank_cd(s.search_vector, websearch_to_tsquery('english', query_text), 32) AS rank
    FROM sources s
    WHERE s.search_vector @@ websearch_to_tsquery('english', query_text)
      AND s.card_id IS NOT NULL
      AND (scope_card_ids IS NULL OR s.card_id = ANY(scope_card_ids))
      AND s.search_vector IS NOT NULL
    ORDER BY rank DESC
    LIMIT match_count * 2
  ),
  vector_results AS (
    -- Vector similarity leg
    SELECT
      s.id,
      1 - (s.embedding <=> query_embedding) AS similarity
    FROM sources s
    WHERE s.embedding IS NOT NULL
      AND s.card_id IS NOT NULL
      AND (scope_card_ids IS NULL OR s.card_id = ANY(scope_card_ids))
    ORDER BY s.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  fts_ranked AS (
    SELECT id, rank AS score, ROW_NUMBER() OVER (ORDER BY rank DESC) AS rank_pos
    FROM fts_results
  ),
  vector_ranked AS (
    SELECT id, similarity AS score, ROW_NUMBER() OVER (ORDER BY similarity DESC) AS rank_pos
    FROM vector_results
  ),
  combined AS (
    SELECT
      COALESCE(f.id, v.id) AS id,
      COALESCE(f.score, 0.0)::REAL AS fts_rank,
      COALESCE(v.score, 0.0)::FLOAT AS vector_similarity,
      (COALESCE(fts_weight / (rrf_k + f.rank_pos), 0.0) +
       COALESCE(vector_weight / (rrf_k + v.rank_pos), 0.0))::FLOAT AS rrf_score
    FROM fts_ranked f
    FULL OUTER JOIN vector_ranked v ON f.id = v.id
  )
  SELECT
    s.id,
    s.card_id,
    c.name AS card_name,
    c.slug AS card_slug,
    s.title,
    s.url,
    s.ai_summary,
    s.key_excerpts,
    s.published_date,
    s.full_text,
    comb.fts_rank,
    comb.vector_similarity,
    comb.rrf_score
  FROM combined comb
  JOIN sources s ON s.id = comb.id
  LEFT JOIN cards c ON c.id = s.card_id
  ORDER BY comb.rrf_score DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION hybrid_search_sources(TEXT, extensions.vector(1536), INT, FLOAT, FLOAT, INT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION hybrid_search_sources(TEXT, extensions.vector(1536), INT, FLOAT, FLOAT, INT, UUID[]) TO service_role;

COMMENT ON FUNCTION hybrid_search_sources IS
  'Hybrid search over sources combining PostgreSQL full-text search and pgvector '
  'cosine similarity via Reciprocal Rank Fusion (RRF). Excludes orphaned '
  '(card_id IS NULL) sources so dangling rows never surface as sourceless chat '
  'citations. Supports tunable fts_weight/vector_weight and optional card-ID scoping.';
