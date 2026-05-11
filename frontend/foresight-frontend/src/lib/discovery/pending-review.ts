/**
 * Pending-review queue API: the human-in-the-loop endpoints that surface,
 * approve/reject, dismiss, and dedupe newly discovered cards before they go
 * into the active intelligence set.
 *
 * @module lib/discovery/pending-review
 */

import { apiRequest, type Card } from "./shared";

/**
 * A card pending human review from the discovery pipeline.
 *
 * Extends the base Card with discovery-specific metadata including
 * AI confidence, source provenance, and suggested edits.
 */
export interface PendingCard extends Card {
  /** AI confidence score for this card's classification (0-1) */
  ai_confidence: number;
  /** ISO 8601 timestamp when the card was discovered */
  discovered_at: string;
  /** URL of the primary source that generated this card */
  source_url?: string;
  /** Type of the source (e.g., 'rss', 'newsapi', 'tavily') */
  source_type?: string;
  /** ID of the discovery run that created this card */
  discovery_run_id?: string;
  /** AI-suggested field modifications for reviewer consideration */
  suggested_changes?: SuggestedChange[];
}

/**
 * An AI-suggested change to a card field.
 *
 * Generated during discovery when AI analysis identifies potential
 * improvements to card metadata for reviewer consideration.
 */
export interface SuggestedChange {
  /** The card field name to modify (e.g., 'pillar_id', 'stage_id') */
  field: string;
  /** Current value of the field */
  current: string;
  /** AI-suggested replacement value */
  suggested: string;
  /** Explanation of why this change is recommended */
  reason: string;
}

/**
 * Breakdown of the discovery score showing contribution from each scoring factor.
 *
 * Used to explain why a card was ranked at a particular position in the
 * personalized discovery queue.
 */
export interface ScoreBreakdown {
  /** Novelty component: higher for recently created or unseen cards (0-1) */
  novelty: number;
  /** Workstream relevance: match against user's active workstream filters (0-1) */
  workstream_relevance: number;
  /** Pillar alignment: match against user's active strategic pillars (0-1) */
  pillar_alignment: number;
  /** Followed context: similarity to cards the user has followed (0-1) */
  followed_context: number;
}

/**
 * Review action types
 */
export type ReviewAction = "approve" | "reject" | "edit" | "defer";

/**
 * Dismiss reasons
 */
export type DismissReason =
  | "duplicate"
  | "irrelevant"
  | "low_quality"
  | "out_of_scope"
  | "already_exists"
  | "other";

/**
 * Fetch all pending review cards
 */
export function fetchPendingReviewCards(
  token: string,
  options?: { limit?: number; offset?: number; sort?: "date" | "confidence" },
): Promise<PendingCard[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.append("limit", String(options.limit));
  if (options?.offset) params.append("offset", String(options.offset));
  if (options?.sort) params.append("sort", options.sort);
  const qs = params.toString();
  return apiRequest<PendingCard[]>(
    `/api/v1/cards/pending-review${qs ? `?${qs}` : ""}`,
    token,
  );
}

/**
 * Fetch pending cards with filters
 */
export function fetchPendingReviewCardsFiltered(
  token: string,
  filters?: {
    pillar_id?: string;
    min_confidence?: number;
    max_confidence?: number;
    source_type?: string;
  },
): Promise<PendingCard[]> {
  const params = new URLSearchParams();
  if (filters?.pillar_id) params.append("pillar_id", filters.pillar_id);
  if (filters?.min_confidence !== undefined)
    params.append("min_confidence", String(filters.min_confidence));
  if (filters?.max_confidence !== undefined)
    params.append("max_confidence", String(filters.max_confidence));
  if (filters?.source_type) params.append("source_type", filters.source_type);

  const queryString = params.toString();
  const endpoint = `/api/v1/cards/pending-review${queryString ? `?${queryString}` : ""}`;

  return apiRequest<PendingCard[]>(endpoint, token);
}

/**
 * Review a single card
 */
export function reviewCard(
  token: string,
  cardId: string,
  action: ReviewAction,
  updates?: Partial<Card>,
): Promise<void> {
  return apiRequest<void>(`/api/v1/cards/${cardId}/review`, token, {
    method: "POST",
    body: JSON.stringify({ action, updates }),
  });
}

/**
 * Bulk review multiple cards with the same action
 */
export function bulkReviewCards(
  token: string,
  cardIds: string[],
  action: ReviewAction,
): Promise<{ processed: number; errors: string[] }> {
  return apiRequest<{ processed: number; errors: string[] }>(
    "/api/v1/cards/bulk-review",
    token,
    {
      method: "POST",
      body: JSON.stringify({ card_ids: cardIds, action }),
    },
  );
}

/**
 * Dismiss a card with optional reason
 */
export function dismissCard(
  token: string,
  cardId: string,
  reason?: DismissReason,
  notes?: string,
): Promise<void> {
  return apiRequest<void>(`/api/v1/cards/${cardId}/dismiss`, token, {
    method: "POST",
    body: JSON.stringify({ reason, notes }),
  });
}

/**
 * Fetch cards similar to a given card (for duplicate detection)
 */
export function fetchSimilarCards(
  token: string,
  cardId: string,
  threshold?: number,
): Promise<Card[]> {
  const params = threshold ? `?threshold=${threshold}` : "";
  return apiRequest<Card[]>(`/api/v1/cards/${cardId}/similar${params}`, token);
}

/**
 * Get count of pending cards (lightweight endpoint)
 */
export async function fetchPendingCount(token: string): Promise<number> {
  const result = await apiRequest<{ count: number }>(
    "/api/v1/discovery/pending/count",
    token,
  );
  return result.count;
}
