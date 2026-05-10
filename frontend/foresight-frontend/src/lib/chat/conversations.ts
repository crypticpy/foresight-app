/**
 * Conversation CRUD: list (with pagination + scope filtering), fetch one with
 * its full message history, delete, rename, and full-text search by title +
 * message content.
 *
 * @module lib/chat/conversations
 */

import { apiRequest, type ChatMessage, type Conversation } from "./shared";

/**
 * Lists conversations for the current user with optional filtering.
 *
 * @param params - Optional pagination and scope filter parameters
 * @returns Array of conversation records
 */
export async function fetchConversations(params?: {
  limit?: number;
  offset?: number;
  scope?: string;
  scope_id?: string;
}): Promise<Conversation[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined)
    searchParams.append("limit", String(params.limit));
  if (params?.offset !== undefined)
    searchParams.append("offset", String(params.offset));
  if (params?.scope) searchParams.append("scope", params.scope);
  if (params?.scope_id) searchParams.append("scope_id", params.scope_id);

  const queryString = searchParams.toString();
  const endpoint = `/api/v1/chat/conversations${queryString ? `?${queryString}` : ""}`;

  return apiRequest<Conversation[]>(endpoint);
}

/**
 * Fetches a single conversation with its full message history.
 *
 * @param conversationId - UUID of the conversation
 * @returns The conversation record and its messages
 */
export async function fetchConversation(conversationId: string): Promise<{
  conversation: Conversation;
  messages: ChatMessage[];
}> {
  return apiRequest<{
    conversation: Conversation;
    messages: ChatMessage[];
  }>(`/api/v1/chat/conversations/${conversationId}`);
}

/**
 * Deletes a conversation and all its messages.
 *
 * @param conversationId - UUID of the conversation to delete
 */
export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  return apiRequest<void>(`/api/v1/chat/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

/**
 * Renames a conversation by updating its title.
 *
 * @param conversationId - UUID of the conversation to rename
 * @param title - The new title for the conversation
 * @returns The updated conversation record
 */
export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<Conversation> {
  return apiRequest<Conversation>(
    `/api/v1/chat/conversations/${conversationId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
    },
  );
}

/** Search conversations by title and message content. */
export async function searchConversations(
  query: string,
  limit?: number,
): Promise<Conversation[]> {
  const searchParams = new URLSearchParams();
  searchParams.append("q", query);
  if (limit !== undefined) searchParams.append("limit", String(limit));
  return apiRequest<Conversation[]>(
    `/api/v1/chat/conversations/search?${searchParams.toString()}`,
  );
}
