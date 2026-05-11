/**
 * Fetches smart follow-up suggestions from the backend the moment a
 * stream finishes. Tracks the streaming→idle transition with a ref so
 * the fetch only fires once per response, and ignores stale responses
 * via a cancellation token.
 *
 * Suggestions reset to an empty array whenever the message list is
 * cleared (new conversation).
 *
 * @module components/Chat/hooks/useSmartSuggestions
 */

import { useEffect, useRef, useState } from "react";
import {
  fetchSmartSuggestions,
  type SmartSuggestion,
} from "../../../lib/chat-api";

export interface UseSmartSuggestionsOptions {
  scope: "signal" | "workstream" | "global";
  scopeId?: string;
  conversationId: string | null | undefined;
  isStreaming: boolean;
  messagesLength: number;
}

export interface UseSmartSuggestionsResult {
  smartSuggestions: SmartSuggestion[];
  smartSuggestionsLoading: boolean;
}

export function useSmartSuggestions({
  scope,
  scopeId,
  conversationId,
  isStreaming,
  messagesLength,
}: UseSmartSuggestionsOptions): UseSmartSuggestionsResult {
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>(
    [],
  );
  const [smartSuggestionsLoading, setSmartSuggestionsLoading] = useState(false);
  const prevIsStreamingRef = useRef(false);

  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    if (wasStreaming && !isStreaming && conversationId && messagesLength > 0) {
      let cancelled = false;
      setSmartSuggestionsLoading(true);

      fetchSmartSuggestions(scope, scopeId, conversationId)
        .then((results) => {
          if (!cancelled && results.length > 0) {
            setSmartSuggestions(results);
          }
        })
        .catch(() => {
          // Silently fail; the UI falls back to regular suggestedQuestions
        })
        .finally(() => {
          if (!cancelled) setSmartSuggestionsLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [isStreaming, conversationId, messagesLength, scope, scopeId]);

  // Reset when a new conversation starts (message list cleared)
  useEffect(() => {
    if (messagesLength === 0) {
      setSmartSuggestions([]);
    }
  }, [messagesLength]);

  return { smartSuggestions, smartSuggestionsLoading };
}
