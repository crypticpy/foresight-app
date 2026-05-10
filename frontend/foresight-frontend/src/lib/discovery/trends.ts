/**
 * Trend visualization data: per-card score history, stage transitions,
 * relationship graph (concept network), and side-by-side card comparison.
 *
 * @module lib/discovery/trends
 */

import { apiRequest } from "./shared";

/**
 * Valid relationship types for card relationships in the concept network
 */
export type RelationshipType =
  | "related"
  | "similar"
  | "derived"
  | "dependent"
  | "parent"
  | "child";

/**
 * Historical score snapshot for a card at a specific point in time.
 * Used for trend visualization showing how card scores have changed over time.
 * Each record captures all 7 score dimensions.
 */
export interface ScoreHistory {
  id: string;
  card_id: string;
  recorded_at: string; // ISO timestamp
  // All 7 score dimensions (0-100 range)
  maturity_score: number | null;
  velocity_score: number | null;
  novelty_score: number | null;
  impact_score: number | null;
  relevance_score: number | null;
  risk_score: number | null;
  opportunity_score: number | null;
}

/**
 * Response model for score history API endpoint.
 * Returns a list of score snapshots for trend visualization.
 */
export interface ScoreHistoryResponse {
  history: ScoreHistory[];
  card_id: string;
  total_count: number;
  start_date?: string | null; // ISO timestamp, filter applied
  end_date?: string | null; // ISO timestamp, filter applied
}

/**
 * Stage transition record for a card.
 * Represents a single stage change event tracking the transition
 * from one maturity stage (1-8) to another with associated horizon changes (H1/H2/H3).
 */
export interface StageHistory {
  id: string;
  card_id: string;
  changed_at: string; // ISO timestamp
  old_stage_id: number | null; // 1-8, null for first record
  new_stage_id: number; // 1-8
  old_horizon: "H1" | "H2" | "H3" | null; // null for first record
  new_horizon: "H1" | "H2" | "H3";
  trigger?: string | null; // e.g., 'manual', 'auto-calculated', 'score_update'
  reason?: string | null; // Optional explanation for the stage change
}

/**
 * Response model for listing stage history records.
 * Returns chronologically ordered stage transitions for a card.
 */
export interface StageHistoryList {
  history: StageHistory[];
  total_count: number;
  card_id: string;
}

/**
 * Card relationship record representing an edge in the concept network.
 * Connects a source card to a target card with relationship metadata.
 */
export interface CardRelationship {
  id: string;
  source_card_id: string;
  target_card_id: string;
  relationship_type: RelationshipType;
  strength: number | null; // 0-1 weight for edge visualization
  created_at: string; // ISO timestamp
}

/**
 * Extended card model with relationship metadata.
 * Used in concept network visualization to display related cards
 * with their relationship context.
 */
export interface RelatedCard {
  id: string;
  name: string;
  slug: string;
  summary?: string | null;
  pillar_id?: string | null;
  stage_id?: string | null;
  horizon?: "H1" | "H2" | "H3" | null;
  // Relationship context
  relationship_type: RelationshipType;
  relationship_strength: number | null; // 0-1
  relationship_id: string;
}

/**
 * Response model for listing related cards.
 * Returns cards connected to a source card in the concept network.
 */
export interface RelatedCardsList {
  related_cards: RelatedCard[];
  total_count: number;
  source_card_id: string;
}

/**
 * Basic card data for comparison view.
 * Contains essential card metadata for side-by-side comparison.
 */
export interface CardData {
  id: string;
  name: string;
  slug: string;
  summary?: string | null;
  pillar_id?: string | null;
  goal_id?: string | null;
  stage_id?: string | null;
  horizon?: "H1" | "H2" | "H3" | null;
  // Current scores for comparison (0-100)
  maturity_score: number | null;
  velocity_score: number | null;
  novelty_score: number | null;
  impact_score: number | null;
  relevance_score: number | null;
  risk_score: number | null;
  opportunity_score: number | null;
  created_at?: string | null; // ISO timestamp
  updated_at?: string | null; // ISO timestamp
}

/**
 * Complete comparison data for a single card.
 * Includes card metadata, score history, and stage history
 * for comprehensive trend comparison visualization.
 */
export interface CardComparisonItem {
  card: CardData;
  score_history: ScoreHistory[];
  stage_history: StageHistory[];
}

/**
 * Response model for card comparison API endpoint.
 * Returns parallel data for two cards to enable synchronized
 * timeline charts and comparative metrics visualization.
 */
export interface CardComparisonResponse {
  card1: CardComparisonItem;
  card2: CardComparisonItem;
  comparison_generated_at: string; // ISO timestamp
}

/**
 * Fetch score history for a card.
 * Returns historical score snapshots for timeline visualization.
 *
 * @param token - Authentication token
 * @param cardId - UUID of the card
 * @param startDate - Optional start date filter (ISO format YYYY-MM-DD)
 * @param endDate - Optional end date filter (ISO format YYYY-MM-DD)
 * @returns ScoreHistoryResponse with historical score data
 */
export function getScoreHistory(
  token: string,
  cardId: string,
  startDate?: string,
  endDate?: string,
): Promise<ScoreHistoryResponse> {
  const params = new URLSearchParams();
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);

  const queryString = params.toString();
  const endpoint = `/api/v1/cards/${cardId}/score-history${queryString ? `?${queryString}` : ""}`;

  return apiRequest<ScoreHistoryResponse>(endpoint, token);
}

/**
 * Fetch stage history for a card.
 * Returns stage transition records for progression visualization.
 *
 * @param token - Authentication token
 * @param cardId - UUID of the card
 * @returns StageHistoryList with stage transition records
 */
export function getStageHistory(
  token: string,
  cardId: string,
): Promise<StageHistoryList> {
  return apiRequest<StageHistoryList>(
    `/api/v1/cards/${cardId}/stage-history`,
    token,
  );
}

/**
 * Fetch related cards for concept network visualization.
 * Returns cards connected to the source card with relationship metadata.
 *
 * @param token - Authentication token
 * @param cardId - UUID of the source card
 * @param limit - Maximum number of related cards to return (default: 20)
 * @returns RelatedCardsList with related cards and relationship context
 */
export function getRelatedCards(
  token: string,
  cardId: string,
  limit: number = 20,
): Promise<RelatedCardsList> {
  const params = new URLSearchParams();
  params.append("limit", String(limit));

  return apiRequest<RelatedCardsList>(
    `/api/v1/cards/${cardId}/related?${params.toString()}`,
    token,
  );
}

/**
 * Compare two cards with their historical data.
 * Returns parallel data for side-by-side comparison visualization.
 *
 * @param token - Authentication token
 * @param cardId1 - UUID of the first card
 * @param cardId2 - UUID of the second card
 * @param startDate - Optional start date filter for score history (ISO format YYYY-MM-DD)
 * @param endDate - Optional end date filter for score history (ISO format YYYY-MM-DD)
 * @returns CardComparisonResponse with synchronized data for both cards
 */
export function compareCards(
  token: string,
  cardId1: string,
  cardId2: string,
  startDate?: string,
  endDate?: string,
): Promise<CardComparisonResponse> {
  const params = new URLSearchParams();
  params.append("card_ids", `${cardId1},${cardId2}`);
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);

  return apiRequest<CardComparisonResponse>(
    `/api/v1/cards/compare?${params.toString()}`,
    token,
  );
}
