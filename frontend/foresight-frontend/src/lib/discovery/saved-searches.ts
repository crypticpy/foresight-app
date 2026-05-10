/**
 * Saved-search persistence: list, create, get, update, delete a user's named
 * search configurations.
 *
 * @module lib/discovery/saved-searches
 */

import { apiRequest } from "./shared";
import type { SearchFilters } from "./search";

/**
 * Query configuration stored in saved searches.
 *
 * Captures the full search state (query text, filters, search mode) so
 * it can be replayed later from the saved searches panel.
 */
export interface SavedSearchQueryConfig {
  /** Free-text search query */
  query?: string;
  /** Structured filters to apply */
  filters?: SearchFilters;
  /** Whether to use vector (semantic) search */
  use_vector_search?: boolean;
}

/**
 * Request model for creating a saved search.
 */
export interface SavedSearchCreate {
  /** User-defined name for this saved search */
  name: string;
  /** The query configuration to save */
  query_config: SavedSearchQueryConfig;
}

/**
 * Request model for updating a saved search.
 *
 * All fields are optional -- only provided fields are updated.
 */
export interface SavedSearchUpdate {
  /** Updated name for the saved search */
  name?: string;
  /** Updated query configuration */
  query_config?: SavedSearchQueryConfig;
}

/**
 * A saved search record belonging to a user.
 *
 * Persists a named search configuration that can be quickly re-executed
 * from the saved searches panel.
 */
export interface SavedSearch {
  /** Unique saved search identifier (UUID) */
  id: string;
  /** ID of the user who created this saved search */
  user_id: string;
  /** User-defined name for this saved search */
  name: string;
  /** The stored query configuration */
  query_config: SavedSearchQueryConfig;
  /** ISO 8601 timestamp when this saved search was created */
  created_at: string;
  /** ISO 8601 timestamp when this saved search was last executed */
  last_used_at: string;
  /** ISO 8601 timestamp when this saved search was last modified */
  updated_at?: string;
}

/**
 * Paginated response for listing saved searches.
 */
export interface SavedSearchList {
  /** List of saved search records */
  saved_searches: SavedSearch[];
  /** Total number of saved searches for this user */
  total_count: number;
}

/**
 * List all saved searches for the current user
 */
export function listSavedSearches(
  token: string,
  limit?: number,
): Promise<SavedSearchList> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.append("limit", String(limit));
  const queryString = params.toString();
  const endpoint = `/api/v1/saved-searches${queryString ? `?${queryString}` : ""}`;
  return apiRequest<SavedSearchList>(endpoint, token);
}

/**
 * Create a new saved search
 */
export function createSavedSearch(
  token: string,
  savedSearch: SavedSearchCreate,
): Promise<SavedSearch> {
  return apiRequest<SavedSearch>("/api/v1/saved-searches", token, {
    method: "POST",
    body: JSON.stringify(savedSearch),
  });
}

/**
 * Get a specific saved search by ID (also updates last_used_at)
 */
export function getSavedSearch(
  token: string,
  searchId: string,
): Promise<SavedSearch> {
  return apiRequest<SavedSearch>(`/api/v1/saved-searches/${searchId}`, token);
}

/**
 * Update a saved search
 */
export function updateSavedSearch(
  token: string,
  searchId: string,
  updates: SavedSearchUpdate,
): Promise<SavedSearch> {
  return apiRequest<SavedSearch>(`/api/v1/saved-searches/${searchId}`, token, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/**
 * Delete a saved search
 */
export function deleteSavedSearch(
  token: string,
  searchId: string,
): Promise<void> {
  return apiRequest<void>(`/api/v1/saved-searches/${searchId}`, token, {
    method: "DELETE",
  });
}
