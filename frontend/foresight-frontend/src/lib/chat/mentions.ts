/**
 * @-mention autocomplete: lookup signals + workstreams by partial name. The
 * resolved entity is later sent back as a `ChatMention` on the streaming POST.
 *
 * @module lib/chat/mentions
 */

import { apiRequest } from "./shared";

/**
 * A mention search result representing a signal or workstream.
 */
export interface MentionResult {
  /** UUID of the entity */
  id: string;
  /** The entity type: "signal" or "workstream" */
  type: "signal" | "workstream";
  /** Display title of the entity */
  title: string;
  /** URL-friendly slug (signals only) */
  slug?: string;
}

/**
 * Searches signals and workstreams for @mention autocomplete.
 *
 * @param query - The search term to match against entity names
 * @returns Array of matching mention results (max 8)
 */
export async function searchMentions(query: string): Promise<MentionResult[]> {
  const searchParams = new URLSearchParams();
  searchParams.append("q", query);
  const result = await apiRequest<{ results: MentionResult[] }>(
    `/api/v1/chat/mentions/search?${searchParams.toString()}`,
  );
  return result.results || [];
}
