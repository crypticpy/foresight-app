/**
 * Shared chat primitives: message/citation/conversation row shapes, the SSE
 * event union the streaming endpoint speaks, and the auth-aware `apiRequest`
 * helper used by every REST function in `lib/chat/`.
 *
 * @module lib/chat/shared
 */

import { getAuthToken } from "../auth";
import { API_BASE_URL } from "../config";

// ----------------------------------------------------------------------------
// Row shapes
// ----------------------------------------------------------------------------

/**
 * A single chat message in a conversation.
 */
export interface ChatMessage {
  /** Unique message identifier (UUID) */
  id: string;
  /** Whether the message is from the user or the assistant */
  role: "user" | "assistant";
  /** The text content of the message */
  content: string;
  /** Citations referenced in the message */
  citations: Citation[];
  /** ISO 8601 timestamp when the message was created */
  created_at: string;
}

/**
 * A citation reference within an assistant message.
 * Links to either a card (signal) or an external source.
 */
export interface Citation {
  /** Display index for inline references like [1], [2] */
  index: number;
  /** UUID of the referenced card, if applicable */
  card_id?: string;
  /** Slug of the referenced card for URL-friendly navigation */
  card_slug?: string;
  /** UUID of the referenced source, if applicable */
  source_id?: string;
  /** Display title of the cited resource */
  title: string;
  /** URL to the external source, if applicable */
  url?: string;
  /** Brief excerpt from the cited content */
  excerpt?: string;
  /** ISO date string when the source was published */
  published_date?: string;
}

/**
 * A conversation session containing one or more message exchanges.
 */
export interface Conversation {
  /** Unique conversation identifier (UUID) */
  id: string;
  /** The scope context of this conversation */
  scope: "signal" | "workstream" | "global";
  /** ID of the scoped entity (card_id or workstream_id), if not global */
  scope_id?: string;
  /** Auto-generated or user-set title for the conversation */
  title?: string;
  /** ISO 8601 timestamp when the conversation was created */
  created_at: string;
  /** ISO 8601 timestamp when the conversation was last updated */
  updated_at: string;
}

/**
 * A server-sent event from the chat streaming endpoint.
 *
 * Discriminated by `type`; each variant has only the fields it actually
 * uses, so consumers narrow `data`/`content` automatically by switching
 * on `type` without casts.
 */
export type SSEEvent =
  | { type: "token"; content: string }
  | { type: "citation"; data: Citation }
  | { type: "suggestions"; data: string[] }
  | {
      type: "done";
      data: { conversation_id: string; message_id: string };
    }
  | {
      type: "error";
      data?: string;
      content?: string;
      /** Stable error code like ``E_CHAT_LLM_TIMEOUT`` for debug/log correlation. */
      code?: string;
      /** Short diagnostic detail (exception class, scope error, etc.). */
      detail?: string;
    }
  | {
      type: "progress";
      data: { step: string; detail: string; tool?: string };
    }
  | { type: "metadata"; data: Record<string, unknown> };

/**
 * Structured mention data for an @-referenced signal or workstream.
 * Sent alongside the message text so the backend can resolve mentions.
 */
export interface ChatMention {
  /** UUID of the mentioned entity */
  id: string;
  /** The entity type: "signal" or "workstream" */
  type: "signal" | "workstream";
  /** Display title of the mentioned entity */
  title: string;
}

// ----------------------------------------------------------------------------
// REST helper
// ----------------------------------------------------------------------------

/**
 * Generic API request helper with authentication.
 *
 * @param endpoint - API endpoint path (without base URL)
 * @param options - Fetch options (method, body, headers, etc.)
 * @returns Typed response from the API
 * @throws Error with message from API response or generic error
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Authentication required. Please sign in.");
  }

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
    throw new Error(
      error.message || error.detail || `API error: ${response.status}`,
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
