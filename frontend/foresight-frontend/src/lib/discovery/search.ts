/**
 * Advanced card search API: filter spec, request/response types, and the
 * `advancedSearch` invocation. Saved-search and history persistence live in
 * adjacent modules.
 *
 * @module lib/discovery/search
 */

import { apiRequest, type DateRange, type ScoreThresholds } from "./shared";

/**
 * Advanced search filters for intelligence cards.
 *
 * All filters are optional and combined with AND logic when applied.
 */
export interface SearchFilters {
  /** Filter by strategic pillar codes */
  pillar_ids?: string[];
  /** Filter by strategic goal identifiers */
  goal_ids?: string[];
  /** Filter by maturity stage identifiers */
  stage_ids?: string[];
  /** Filter by technology horizon, or 'ALL' for no horizon filter */
  horizon?: "H1" | "H2" | "H3" | "ALL";
  /** Filter by creation/update date range */
  date_range?: DateRange;
  /** Filter by score thresholds across dimensions */
  score_thresholds?: ScoreThresholds;
  /** Filter by card lifecycle status */
  status?: string;
}

/**
 * Request model for advanced card search.
 *
 * Supports both text-based and vector (semantic) search with optional filters.
 */
export interface AdvancedSearchRequest {
  /** Free-text search query */
  query?: string;
  /** Structured filters to apply */
  filters?: SearchFilters;
  /** Whether to use vector (semantic) search instead of text search */
  use_vector_search?: boolean;
  /** Maximum number of results to return */
  limit?: number;
  /** Number of results to skip for pagination */
  offset?: number;
}

/**
 * Individual search result with relevance score.
 *
 * Contains card data along with search-specific metadata such as
 * vector similarity scores and text match highlights.
 */
export interface SearchResultItem {
  /** Unique card identifier (UUID) */
  id: string;
  /** Display name of the card */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Brief card summary */
  summary?: string;
  /** Extended card description */
  description?: string;
  /** Strategic pillar code */
  pillar_id?: string;
  /** Strategic goal identifier */
  goal_id?: string;
  /** Anchor card reference */
  anchor_id?: string;
  /** Maturity stage identifier */
  stage_id?: string;
  /** Technology horizon */
  horizon?: string;
  /** Novelty score (0-100) */
  novelty_score?: number;
  /** Maturity score (0-100) */
  maturity_score?: number;
  /** Impact score (0-100) */
  impact_score?: number;
  /** Relevance score (0-100) */
  relevance_score?: number;
  /** Velocity score (0-100) */
  velocity_score?: number;
  /** Risk score (0-100) */
  risk_score?: number;
  /** Opportunity score (0-100) */
  opportunity_score?: number;
  /** Card lifecycle status */
  status?: string;
  /** ISO 8601 creation timestamp */
  created_at?: string;
  /** ISO 8601 last update timestamp */
  updated_at?: string;
  /** Vector similarity score (0-1), populated when semantic search is used */
  search_relevance?: number;
  /** Text snippets with matching terms highlighted */
  match_highlights?: string[];
}

/**
 * Response model for advanced search results.
 *
 * Contains the matching cards along with pagination metadata
 * and information about how the search was executed.
 */
export interface AdvancedSearchResponse {
  /** List of matching search result items */
  results: SearchResultItem[];
  /** Total number of matching results across all pages */
  total_count: number;
  /** The query string that was searched, if provided */
  query?: string;
  /** The filters that were applied to the search */
  filters_applied?: SearchFilters;
  /** Whether vector (semantic) or text search was used */
  search_type: "vector" | "text";
}

/**
 * Execute an advanced search with filters and optional vector search
 */
export function advancedSearch(
  token: string,
  request: AdvancedSearchRequest,
): Promise<AdvancedSearchResponse> {
  return apiRequest<AdvancedSearchResponse>("/api/v1/cards/search", token, {
    method: "POST",
    body: JSON.stringify(request),
  });
}
