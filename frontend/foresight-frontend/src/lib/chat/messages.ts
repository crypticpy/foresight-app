/**
 * Per-message operations: PDF export of a single assistant message, pin /
 * unpin for quick reference, and the user's pinned-messages list (which
 * embeds enough conversation context to render the pin without a follow-up
 * fetch).
 *
 * @module lib/chat/messages
 */

import { getAuthToken } from "../auth";
import { API_BASE_URL } from "../config";
import { apiRequest, type Citation } from "./shared";

// ----------------------------------------------------------------------------
// PDF export
// ----------------------------------------------------------------------------

/**
 * Exports a chat message as a PDF document.
 *
 * Makes an authenticated GET request to the backend export endpoint
 * and returns the response as a Blob for client-side download.
 *
 * @param messageId - UUID of the message to export
 * @returns A Blob containing the PDF file data
 * @throws Error if authentication fails or the export request errors
 */
export async function exportChatMessagePDF(messageId: string): Promise<Blob> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Authentication required. Please sign in.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/chat/messages/${messageId}/export/pdf`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Failed to export PDF" }));
    throw new Error(
      error.message || error.detail || `Export error: ${response.status}`,
    );
  }

  return response.blob();
}

// ----------------------------------------------------------------------------
// Pin / save
// ----------------------------------------------------------------------------

/** Pin a chat message for quick reference. */
export async function pinMessage(
  messageId: string,
  note?: string,
): Promise<unknown> {
  return apiRequest(`/api/v1/chat/messages/${messageId}/pin`, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

/** Unpin a previously pinned chat message. */
export async function unpinMessage(messageId: string): Promise<void> {
  return apiRequest<void>(`/api/v1/chat/messages/${messageId}/pin`, {
    method: "DELETE",
  });
}

/** Pinned message with its conversation context. */
export interface PinnedMessage {
  id: string;
  message_id: string;
  conversation_id: string;
  note: string | null;
  created_at: string;
  chat_messages: {
    id: string;
    content: string;
    role: string;
    citations: Citation[];
    created_at: string;
  };
  chat_conversations: {
    id: string;
    title: string | null;
    scope: string;
  };
}

/** Fetch the current user's pinned messages. */
export async function fetchPinnedMessages(params?: {
  limit?: number;
  offset?: number;
}): Promise<PinnedMessage[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined)
    searchParams.append("limit", String(params.limit));
  if (params?.offset !== undefined)
    searchParams.append("offset", String(params.offset));
  const qs = searchParams.toString();
  return apiRequest<PinnedMessage[]>(`/api/v1/chat/pins${qs ? `?${qs}` : ""}`);
}
