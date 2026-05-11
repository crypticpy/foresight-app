/**
 * SSE streaming surface: post a chat message and consume the server-sent-event
 * response with `parseSSEStream`. Token/citation/suggestion/etc. callbacks are
 * dispatched via a small line-by-line state machine that buffers partial
 * chunks across `fetch` reads.
 *
 * @module lib/chat/streaming
 */

import { getAuthToken } from "../auth";
import { API_BASE_URL } from "../config";
import type { ChatMention, Citation, SSEEvent } from "./shared";

// ----------------------------------------------------------------------------
// Streaming POST
// ----------------------------------------------------------------------------

/**
 * Sends a chat message to the streaming endpoint.
 *
 * Returns the raw Response so the caller can read the SSE stream
 * via parseSSEStream(). The response body is a ReadableStream
 * of server-sent events.
 *
 * @param params - Message parameters including scope, message text, and optional conversation ID
 * @param signal - Optional AbortSignal to cancel the request
 * @returns The raw fetch Response for stream reading
 * @throws Error if authentication fails or the request errors
 */
export async function sendChatMessage(
  params: {
    scope: string;
    scope_id?: string;
    message: string;
    conversation_id?: string;
    mentions?: ChatMention[];
  },
  signal?: AbortSignal,
): Promise<Response> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Authentication required. Please sign in.");
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      scope: params.scope,
      scope_id: params.scope_id,
      message: params.message,
      conversation_id: params.conversation_id,
      ...(params.mentions?.length ? { mentions: params.mentions } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Chat request failed" }));
    throw new Error(
      error.message || error.detail || `Chat error: ${response.status}`,
    );
  }

  return response;
}

// ----------------------------------------------------------------------------
// Stream parser
// ----------------------------------------------------------------------------

/**
 * Bag of callbacks that `parseSSEStream` invokes as events arrive.
 */
interface SSECallbacks {
  onToken: (content: string) => void;
  onCitation: (citation: Citation) => void;
  onSuggestions: (suggestions: string[]) => void;
  onDone: (data: { conversation_id: string; message_id: string }) => void;
  onError: (error: string) => void;
  /** Called when the backend reports a processing progress step */
  onProgress?: (data: { step: string; detail: string }) => void;
  /** Called when the backend sends response metadata (source counts, etc.) */
  onMetadata?: (data: Record<string, unknown>) => void;
}

/**
 * Parses a Server-Sent Events stream from a fetch Response.
 *
 * Handles:
 * - Buffering partial lines when data arrives in chunks mid-line
 * - Empty lines between SSE events
 * - The "data: " prefix on each event line
 * - JSON parsing of event payloads
 * - Graceful handling of stream disconnects
 *
 * @param response - The fetch Response with a readable SSE body
 * @param callbacks - Event-specific callback handlers
 */
export async function parseSSEStream(
  response: Response,
  callbacks: SSECallbacks,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError("Response body is not readable");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining buffered data
        if (buffer.trim()) {
          processSSELine(buffer, callbacks);
        }
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines from the buffer
      const lines = buffer.split("\n");
      // Keep the last element as it may be an incomplete line
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines (SSE event separator)
        if (!trimmed) continue;
        processSSELine(trimmed, callbacks);
      }
    }
  } catch (err) {
    // AbortError is expected when user cancels
    if (err instanceof DOMException && err.name === "AbortError") {
      return;
    }
    callbacks.onError(
      err instanceof Error ? err.message : "Stream reading failed",
    );
  } finally {
    reader.releaseLock();
  }
}

function processSSELine(line: string, callbacks: SSECallbacks): void {
  // SSE lines have the format: "data: {json}"
  if (!line.startsWith("data: ")) return;

  const jsonStr = line.slice(6); // Remove "data: " prefix

  // Handle "[DONE]" sentinel if used
  if (jsonStr === "[DONE]") return;

  try {
    const event: SSEEvent = JSON.parse(jsonStr);

    switch (event.type) {
      case "token":
        callbacks.onToken(event.content);
        break;

      case "citation":
        callbacks.onCitation(event.data);
        break;

      case "suggestions":
        callbacks.onSuggestions(event.data);
        break;

      case "done":
        callbacks.onDone(event.data);
        break;

      case "error": {
        const baseMsg =
          event.data || event.content || "Unknown streaming error";
        const codePrefix = event.code ? `[${event.code}] ` : "";
        const detailSuffix = event.detail ? ` — ${event.detail}` : "";
        callbacks.onError(`${codePrefix}${baseMsg}${detailSuffix}`);
        break;
      }

      case "progress":
        callbacks.onProgress?.(event.data);
        break;

      case "metadata":
        callbacks.onMetadata?.(event.data);
        break;
    }
  } catch {
    // Malformed JSON - skip this line silently
  }
}
