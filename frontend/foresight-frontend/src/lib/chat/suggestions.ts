/**
 * Suggested prompts and the empty-state stats: legacy flat suggestions,
 * categorized "smart" follow-ups, and the small facts-list used to fill the
 * empty chat panel.
 *
 * @module lib/chat/suggestions
 */

import { apiRequest } from "./shared";

/**
 * Fetches suggested questions for a given scope.
 *
 * Returns contextually relevant questions based on the scope
 * (e.g., questions about a specific signal or workstream).
 *
 * @param scope - The chat scope ("signal", "workstream", or "global")
 * @param scopeId - Optional ID of the scoped entity
 * @returns Array of suggested question strings
 */
export async function fetchSuggestions(
  scope: string,
  scopeId?: string,
): Promise<string[]> {
  const searchParams = new URLSearchParams();
  searchParams.append("scope", scope);
  if (scopeId) searchParams.append("scope_id", scopeId);

  const queryString = searchParams.toString();
  return apiRequest<string[]>(`/api/v1/chat/suggestions?${queryString}`);
}

/**
 * A categorized smart suggestion returned by the smart suggestions endpoint.
 */
export interface SmartSuggestion {
  /** The suggested question text */
  text: string;
  /** Category: "deeper" | "compare" | "action" | "explore" */
  category: string;
}

/**
 * Fetches context-aware categorized follow-up suggestions.
 *
 * When a conversationId is provided, the backend uses recent messages
 * to generate more relevant suggestions grouped by category.
 *
 * @param scope - The chat scope ("signal", "workstream", or "global")
 * @param scopeId - Optional ID of the scoped entity
 * @param conversationId - Optional conversation ID for context-aware suggestions
 * @returns Array of SmartSuggestion objects with text and category
 */
export async function fetchSmartSuggestions(
  scope: string,
  scopeId?: string,
  conversationId?: string,
): Promise<SmartSuggestion[]> {
  const searchParams = new URLSearchParams();
  searchParams.append("scope", scope);
  if (scopeId) searchParams.append("scope_id", scopeId);
  if (conversationId) searchParams.append("conversation_id", conversationId);

  const queryString = searchParams.toString();
  const result = await apiRequest<{ suggestions: SmartSuggestion[] }>(
    `/api/v1/chat/suggestions/smart?${queryString}`,
  );
  return result.suggestions || [];
}

/** Fetch lightweight stats for the chat empty state. */
export async function fetchChatStats(): Promise<{ facts: string[] }> {
  return apiRequest<{ facts: string[] }>("/api/v1/chat/stats");
}
