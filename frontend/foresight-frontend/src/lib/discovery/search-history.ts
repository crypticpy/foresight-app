/**
 * Search-history persistence: record, list, delete-one, and clear-all of the
 * user's executed-search log.
 *
 * @module lib/discovery/search-history
 */

import { apiRequest } from "./shared";
import type { SavedSearchQueryConfig } from "./saved-searches";

/**
 * A search history record capturing a past search execution.
 *
 * Automatically recorded when a user executes a search, enabling
 * quick access to recent searches.
 */
export interface SearchHistoryEntry {
  /** Unique history entry identifier (UUID) */
  id: string;
  /** ID of the user who executed the search */
  user_id: string;
  /** The query configuration that was executed */
  query_config: SavedSearchQueryConfig;
  /** ISO 8601 timestamp when the search was executed */
  executed_at: string;
  /** Number of results returned by this search */
  result_count: number;
}

/**
 * Request model for recording a search execution in history.
 */
export interface SearchHistoryCreate {
  /** The query configuration that was executed */
  query_config: SavedSearchQueryConfig;
  /** Number of results returned */
  result_count: number;
}

/**
 * Paginated response for listing search history entries.
 */
export interface SearchHistoryList {
  /** List of search history entries, most recent first */
  history: SearchHistoryEntry[];
  /** Total number of history entries for this user */
  total_count: number;
}

/**
 * Get the current user's search history
 */
export function getSearchHistory(
  token: string,
  limit?: number,
): Promise<SearchHistoryList> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.append("limit", String(limit));
  const queryString = params.toString();
  const endpoint = `/api/v1/search-history${queryString ? `?${queryString}` : ""}`;
  return apiRequest<SearchHistoryList>(endpoint, token);
}

/**
 * Record a search in the user's history
 */
export function recordSearchHistory(
  token: string,
  entry: SearchHistoryCreate,
): Promise<SearchHistoryEntry> {
  return apiRequest<SearchHistoryEntry>("/api/v1/search-history", token, {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

/**
 * Delete a specific search history entry
 */
export function deleteSearchHistoryEntry(
  token: string,
  entryId: string,
): Promise<void> {
  return apiRequest<void>(`/api/v1/search-history/${entryId}`, token, {
    method: "DELETE",
  });
}

/**
 * Clear all search history for the current user
 */
export function clearSearchHistory(token: string): Promise<void> {
  return apiRequest<void>("/api/v1/search-history", token, {
    method: "DELETE",
  });
}
