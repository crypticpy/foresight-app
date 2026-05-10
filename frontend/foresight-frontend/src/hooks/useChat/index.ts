/**
 * useChat — chat panel state machine. Owns messages, streaming state,
 * conversation lifecycle, and suggested questions across signal,
 * workstream, and global scopes.
 *
 * @module hooks/useChat
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchConversation,
  fetchSuggestions,
  parseSSEStream,
  sendChatMessage,
  type ChatMention,
  type ChatMessage,
  type Citation,
} from "../../lib/chat-api";

import { persistConversationId, restoreConversationId } from "./sessionStorage";
import type { UseChatOptions, UseChatReturn } from "./types";
import { useRestoreConversation } from "./useRestoreConversation";

export type { UseChatOptions, UseChatReturn } from "./types";

export function useChat(options: UseChatOptions): UseChatReturn {
  const { scope, scopeId, initialConversationId, forceNew } = options;

  // Resolve starting conversation: explicit prop > sessionStorage > null.
  // forceNew skips restoration entirely.
  const resolvedInitialId = forceNew
    ? null
    : (initialConversationId ?? restoreConversationId(scope, scopeId));

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);

  const [conversationId, setConversationId] = useState<string | null>(
    resolvedInitialId,
  );
  const [conversationTitle, setConversationTitle] = useState<string | null>(
    null,
  );
  const [conversationUpdatedAt, setConversationUpdatedAt] = useState<
    string | null
  >(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [funFact, setFunFact] = useState<string | null>(null);

  const [progressStep, setProgressStep] = useState<{
    step: string;
    detail: string;
  } | null>(null);
  const [responseMetadata, setResponseMetadata] = useState<Record<
    string,
    unknown
  > | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const lastFailedMessageRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    async (message: string, mentions?: ChatMention[]) => {
      if (!message.trim() || isStreaming) return;

      lastFailedMessageRef.current = message.trim();
      setError(null);
      setProgressStep(null);
      setResponseMetadata(null);

      const userMessage: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content: message.trim(),
        citations: [],
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent("");
      setStreamingCitations([]);
      setSuggestedQuestions([]);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await sendChatMessage(
          {
            scope,
            scope_id: scopeId,
            message: message.trim(),
            conversation_id: conversationId ?? undefined,
            mentions: mentions?.length ? mentions : undefined,
          },
          abortController.signal,
        );

        let accumulatedContent = "";
        const accumulatedCitations: Citation[] = [];

        await parseSSEStream(response, {
          onToken: (content) => {
            if (!isMountedRef.current) return;
            accumulatedContent += content;
            setStreamingContent(accumulatedContent);
          },

          onCitation: (citation) => {
            if (!isMountedRef.current) return;
            accumulatedCitations.push(citation);
            setStreamingCitations([...accumulatedCitations]);
          },

          onSuggestions: (suggestions) => {
            if (!isMountedRef.current) return;
            setSuggestedQuestions(suggestions);
          },

          onProgress: (data) => {
            if (!isMountedRef.current) return;
            setProgressStep(data);
          },

          onMetadata: (data) => {
            if (!isMountedRef.current) return;
            setResponseMetadata(data);
          },

          onDone: (data) => {
            if (!isMountedRef.current) return;

            lastFailedMessageRef.current = null;
            setProgressStep(null);

            if (data.conversation_id) {
              setConversationId(data.conversation_id);
              persistConversationId(scope, scopeId, data.conversation_id);
            }

            const assistantMessage: ChatMessage = {
              id: data.message_id || `temp-assistant-${Date.now()}`,
              role: "assistant",
              content: accumulatedContent,
              citations: accumulatedCitations,
              created_at: new Date().toISOString(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
            setStreamingContent("");
            setStreamingCitations([]);
            setIsStreaming(false);
          },

          onError: (errorMsg) => {
            if (!isMountedRef.current) return;
            setError(errorMsg);
            setProgressStep(null);
            setIsStreaming(false);
            setStreamingContent("");
            setStreamingCitations([]);
          },
        });
      } catch (err) {
        if (!isMountedRef.current) return;

        if (err instanceof DOMException && err.name === "AbortError") {
          setIsStreaming(false);
          return;
        }

        setError(err instanceof Error ? err.message : "Failed to send message");
        setProgressStep(null);
        setIsStreaming(false);
        setStreamingContent("");
        setStreamingCitations([]);
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [scope, scopeId, conversationId, isStreaming],
  );

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setStreamingContent((currentContent) => {
      if (currentContent) {
        setStreamingCitations((currentCitations) => {
          const partialMessage: ChatMessage = {
            id: `temp-partial-${Date.now()}`,
            role: "assistant",
            content: currentContent,
            citations: currentCitations,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, partialMessage]);
          return [];
        });
      }
      return "";
    });

    setIsStreaming(false);
  }, []);

  const loadConversation = useCallback(
    async (convId: string) => {
      setError(null);
      try {
        const data = await fetchConversation(convId);
        if (!isMountedRef.current) return;

        setConversationId(data.conversation.id);
        setConversationTitle(data.conversation.title ?? null);
        setConversationUpdatedAt(data.conversation.updated_at ?? null);
        setMessages(data.messages);
        setSuggestedQuestions([]);
        persistConversationId(scope, scopeId, data.conversation.id);
      } catch {
        if (!isMountedRef.current) return;
        persistConversationId(scope, scopeId, null);
        setConversationId(null);
        setError(null);
      }
    },
    [scope, scopeId],
  );

  const startNewConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setMessages([]);
    setConversationId(null);
    setConversationTitle(null);
    setConversationUpdatedAt(null);
    setStreamingContent("");
    setStreamingCitations([]);
    setIsStreaming(false);
    setError(null);
    setSuggestedQuestions([]);
    persistConversationId(scope, scopeId, null);
  }, [scope, scopeId]);

  const loadSuggestions = useCallback(async () => {
    try {
      const suggestions = await fetchSuggestions(scope, scopeId);
      if (!isMountedRef.current) return;
      setSuggestedQuestions(suggestions);
    } catch {
      // Suggestions are non-critical, fail silently.
    }
  }, [scope, scopeId]);

  const retryLastMessage = useCallback(() => {
    if (!lastFailedMessageRef.current) return;
    const msg = lastFailedMessageRef.current;
    setMessages((prev) => {
      let lastUserIdx = -1;
      for (let j = prev.length - 1; j >= 0; j--) {
        if (prev[j]?.role === "user") {
          lastUserIdx = j;
          break;
        }
      }
      return lastUserIdx >= 0 ? prev.slice(0, lastUserIdx) : prev;
    });
    setError(null);
    sendMessage(msg);
  }, [sendMessage]);

  useRestoreConversation({
    forceNew,
    resolvedInitialId,
    scope,
    scopeId,
    isMountedRef,
    loadConversation,
    loadSuggestions,
    setFunFact,
  });

  return {
    messages,
    isStreaming,
    streamingContent,
    streamingCitations,
    conversationId,
    conversationTitle,
    conversationUpdatedAt,
    suggestedQuestions,
    error,
    sendMessage,
    stopGenerating,
    loadConversation,
    startNewConversation,
    loadSuggestions,
    retryLastMessage,
    progressStep,
    responseMetadata,
    funFact,
  };
}
