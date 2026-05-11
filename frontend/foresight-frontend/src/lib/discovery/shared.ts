/**
 * Shared primitives for discovery API modules: the authenticated `apiRequest`
 * helper, the discovery-flavored `Card` type, and the score/date range filters
 * used across multiple sub-modules.
 *
 * @module lib/discovery/shared
 */

import { API_BASE_URL } from "../config";
import type { FullCard } from "../../types/card";

/**
 * Intelligence card payload returned by the discovery/cards endpoints.
 *
 * Aliases the canonical `FullCard` (see `types/card.ts`) and adds the
 * lifecycle `status` field that the discovery endpoints return on top.
 * Prefer importing from this module when working with create/update API
 * payloads; use `FullCard` directly for read-only views that don't need
 * `status`.
 */
export type Card = FullCard & {
  /** Card lifecycle status (e.g., 'active', 'pending_review', 'archived') */
  status: string;
};

/**
 * Date range filter for created_at/updated_at filtering.
 *
 * Both bounds are optional -- omitting either creates an open-ended range.
 */
export interface DateRange {
  /** Start date (inclusive) in ISO format YYYY-MM-DD */
  start?: string;
  /** End date (inclusive) in ISO format YYYY-MM-DD */
  end?: string;
}

/**
 * Min/max threshold for filtering a single score field.
 *
 * Both bounds are optional -- omitting either creates an open-ended range.
 */
export interface ScoreThreshold {
  /** Minimum score value (0-100, inclusive) */
  min?: number;
  /** Maximum score value (0-100, inclusive) */
  max?: number;
}

/**
 * Collection of score threshold filters for all seven scoring dimensions.
 *
 * Each threshold is optional -- only provided thresholds are applied.
 */
export interface ScoreThresholds {
  /** Impact score threshold filter */
  impact_score?: ScoreThreshold;
  /** Relevance score threshold filter */
  relevance_score?: ScoreThreshold;
  /** Novelty score threshold filter */
  novelty_score?: ScoreThreshold;
  /** Maturity score threshold filter */
  maturity_score?: ScoreThreshold;
  /** Velocity score threshold filter */
  velocity_score?: ScoreThreshold;
  /** Risk score threshold filter */
  risk_score?: ScoreThreshold;
  /** Opportunity score threshold filter */
  opportunity_score?: ScoreThreshold;
}

/**
 * Authenticated fetch wrapper for discovery endpoints.
 *
 * Adds the bearer token, JSON content type, and shared error handling. Returns
 * `undefined` for 204 responses so void-returning endpoints don't fail JSON
 * parsing.
 */
export async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
