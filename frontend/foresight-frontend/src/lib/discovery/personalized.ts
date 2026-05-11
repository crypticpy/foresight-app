/**
 * Personalized discovery queue: a per-user ranked feed of cards combining
 * novelty, workstream relevance, pillar alignment, and follow context.
 *
 * @module lib/discovery/personalized
 */

import { apiRequest, type Card } from "./shared";
import type { ScoreBreakdown } from "./pending-review";

/**
 * A card with personalized discovery scoring for queue ranking.
 *
 * Extends the base Card with a composite discovery_score and optional
 * breakdown showing how each factor contributed to the ranking.
 */
export interface PersonalizedCard extends Card {
  /** Composite discovery score used for queue ordering (0-100) */
  discovery_score: number;
  /** Optional breakdown of the discovery score components */
  score_breakdown?: ScoreBreakdown;
}

/**
 * Fetch personalized discovery queue with multi-factor scoring
 *
 * Returns cards ranked by discovery_score, which combines:
 * - Novelty (recent/unseen cards)
 * - Workstream relevance (matching user's workstream filters)
 * - Pillar alignment (cards in user's active pillars)
 * - Followed context (similar to user's followed cards)
 */
export function fetchPersonalizedDiscoveryQueue(
  token: string,
  limit: number = 20,
  offset: number = 0,
): Promise<PersonalizedCard[]> {
  const params = new URLSearchParams();
  params.append("limit", String(limit));
  params.append("offset", String(offset));

  const queryString = params.toString();
  const endpoint = `/api/v1/me/discovery/queue?${queryString}`;

  return apiRequest<PersonalizedCard[]>(endpoint, token);
}
