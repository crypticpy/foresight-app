/**
 * The main reusable chat surface used across the /ask page, signal detail,
 * and workstream pages. Wires together the `useChat` streaming hook plus
 * a stack of focused sub-hooks (mention autocomplete, smart suggestions,
 * continue banner, auto-scroll, voice input) and the per-section view
 * components (header, banners, empty state, message list, smart
 * suggestions, error, input bar).
 *
 * @module components/Chat/ChatPanel
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useChat } from "../../hooks/useChat";
import { useChatKeyboard } from "../../hooks/useChatKeyboard";
import { ChatMessage as ChatMessageComponent } from "./ChatMessage";
import type { Citation } from "../../lib/chat-api";

import { useMentionAutocomplete } from "./hooks/useMentionAutocomplete";
import { useSmartSuggestions } from "./hooks/useSmartSuggestions";
import { useContinueBanner } from "./hooks/useContinueBanner";
import { useChatAutoScroll } from "./hooks/useChatAutoScroll";
import { useChatVoiceInput } from "./hooks/useChatVoiceInput";

import { ChatHeader } from "./components/ChatHeader";
import { ChatContinueBanner } from "./components/ChatContinueBanner";
import { ChatEmptyState } from "./components/ChatEmptyState";
import { ChatErrorBanner } from "./components/ChatErrorBanner";
import { ChatSmartSuggestions } from "./components/ChatSmartSuggestions";
import { ChatThinkingIndicator } from "./components/ChatThinkingIndicator";
import { ChatInputBar } from "./components/ChatInputBar";

export interface ChatPanelProps {
  /** The scope context for this chat session. */
  scope: "signal" | "workstream" | "global";
  /** ID of the scoped entity (card_id or workstream_id), if not global. */
  scopeId?: string;
  /** Additional CSS classes for the root element. */
  className?: string;
  /** Compact mode for slide-out panels. */
  compact?: boolean;
  /** Pre-fill and auto-send this query on mount. */
  initialQuery?: string;
  /** Custom placeholder for the input. */
  placeholder?: string;
  /** Title shown in the empty state. */
  emptyStateTitle?: string;
  /** Description shown below the empty state title. */
  emptyStateDescription?: string;
  /** Called when a citation is clicked. */
  onCitationClick?: (citation: Citation) => void;
  /** Resume an existing conversation by ID. */
  initialConversationId?: string;
  /** Called when the active conversation changes (created or loaded). */
  onConversationChange?: (conversationId: string | null) => void;
  /** Skip auto-restoring the most recent conversation ("New Chat" path). */
  forceNew?: boolean;
}

export function ChatPanel({
  scope,
  scopeId,
  className,
  compact = false,
  initialQuery,
  placeholder = "Ask Foresight about signals, trends, and strategy...",
  emptyStateTitle = "Ask Foresight",
  emptyStateDescription = "Ask questions about signals, emerging trends, strategic priorities, and more. Foresight uses AI to synthesize intelligence from your data.",
  onCitationClick,
  initialConversationId,
  onConversationChange,
  forceNew,
}: ChatPanelProps) {
  const {
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
    retryLastMessage,
    progressStep,
  } = useChat({ scope, scopeId, initialConversationId, forceNew });

  // Notify parent on conversation id change
  useEffect(() => {
    onConversationChange?.(conversationId);
  }, [conversationId, onConversationChange]);

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialQuerySentRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  // ---------------------------------------------------------------------------
  // Sub-hooks
  // ---------------------------------------------------------------------------

  const mention = useMentionAutocomplete({
    inputValue,
    setInputValue,
    textareaRef,
  });

  const { smartSuggestions, smartSuggestionsLoading } = useSmartSuggestions({
    scope,
    scopeId,
    conversationId,
    isStreaming,
    messagesLength: messages.length,
  });

  const { showContinueBanner, dismissBanner, markUserSent } = useContinueBanner(
    {
      messagesLength: messages.length,
      conversationTitle,
      conversationUpdatedAt,
    },
  );

  useChatAutoScroll({
    messagesEndRef,
    messagesLength: messages.length,
    streamingContent,
  });

  const { isListening, isSpeechSupported, handleMicToggle } = useChatVoiceInput(
    {
      setInputValue,
      textareaRef,
    },
  );

  // Reset accumulated mentions when conversation cleared
  useEffect(() => {
    if (messages.length === 0) {
      mention.clearActiveMentions();
    }
    // mention.clearActiveMentions is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // ---------------------------------------------------------------------------
  // Auto-send initial query
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (initialQuery && !initialQuerySentRef.current) {
      initialQuerySentRef.current = true;
      sendMessage(initialQuery);
    }
  }, [initialQuery, sendMessage]);

  // Reset error-dismissed when a new error arrives
  useEffect(() => {
    if (error) setErrorDismissed(false);
  }, [error]);

  // ---------------------------------------------------------------------------
  // Submit / keyboard handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return;

    sendMessage(
      inputValue.trim(),
      mention.activeMentions.length > 0 ? mention.activeMentions : undefined,
    );
    setInputValue("");
    mention.clearActiveMentions();
    mention.setMentionInactive();
    markUserSent();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [inputValue, isStreaming, sendMessage, mention, markUserSent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mention.mentionActive) {
        if (
          e.key === "ArrowDown" ||
          e.key === "ArrowUp" ||
          e.key === "Enter" ||
          e.key === "Tab" ||
          e.key === "Escape"
        ) {
          return; // Handled by the autocomplete's own listener
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, mention.mentionActive],
  );

  const handleSuggestionSelect = useCallback(
    (question: string) => {
      sendMessage(question);
    },
    [sendMessage],
  );

  const handleCopyLastResponse = useCallback(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (lastAssistant) {
      navigator.clipboard.writeText(lastAssistant.content).catch(() => {});
    }
  }, [messages]);

  useChatKeyboard({
    onFocusInput: () => textareaRef.current?.focus(),
    onNewConversation: startNewConversation,
    onCopyLastResponse: handleCopyLastResponse,
    onStopGenerating: stopGenerating,
    isStreaming,
  });

  // ---------------------------------------------------------------------------
  // Conversation switch crossfade
  // ---------------------------------------------------------------------------

  const [fadeIn, setFadeIn] = useState(true);
  const prevConversationIdRef = useRef(conversationId);

  useEffect(() => {
    const prevId = prevConversationIdRef.current;
    prevConversationIdRef.current = conversationId;
    if (prevId && conversationId && prevId !== conversationId) {
      setFadeIn(false);
      const timer = requestAnimationFrame(() => setFadeIn(true));
      return () => cancelAnimationFrame(timer);
    }
    return undefined;
  }, [conversationId]);

  const showEmptyState = messages.length === 0 && !isStreaming;
  const showError = error && !errorDismissed;
  const lastMessage = messages[messages.length - 1];
  const lastMessageInterrupted =
    lastMessage?.id?.startsWith("temp-partial-") === true;

  return (
    <div
      className={cn(
        "flex flex-col h-full",
        "bg-white dark:bg-dark-surface-deep",
        className,
      )}
    >
      {messages.length > 0 && (
        <ChatHeader
          scope={scope}
          scopeId={scopeId}
          activeConversationId={conversationId}
          onSelectConversation={loadConversation}
          onNewConversation={startNewConversation}
        />
      )}

      {showContinueBanner && conversationTitle && conversationUpdatedAt && (
        <ChatContinueBanner
          conversationTitle={conversationTitle}
          conversationUpdatedAt={conversationUpdatedAt}
          onStartNew={() => {
            dismissBanner();
            startNewConversation();
          }}
        />
      )}

      <div
        className={cn(
          "flex-1 overflow-y-auto",
          compact ? "px-3 py-3" : "px-4 py-4 sm:px-6",
          "scroll-smooth",
          "transition-opacity duration-200",
          fadeIn ? "opacity-100" : "opacity-0",
        )}
      >
        {showEmptyState && (
          <ChatEmptyState
            title={emptyStateTitle}
            description={emptyStateDescription}
            compact={compact}
            suggestedQuestions={suggestedQuestions}
            onSuggestionSelect={handleSuggestionSelect}
          />
        )}

        {messages.map((message, index) => (
          <div
            key={message.id}
            className={cn(
              "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
              index > 0 && "mt-4",
            )}
            style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
          >
            <ChatMessageComponent
              message={message}
              onCitationClick={onCitationClick}
            />
          </div>
        ))}

        {lastMessageInterrupted && !isStreaming && (
          <div className="mt-2 ml-10 text-xs text-gray-400 dark:text-gray-500 italic">
            Response was interrupted.{" "}
            <button
              type="button"
              onClick={retryLastMessage}
              className="text-brand-blue hover:underline focus:outline-none"
            >
              Retry
            </button>
          </div>
        )}

        {isStreaming && streamingContent && (
          <div className="mt-4 animate-in fade-in-0 duration-200">
            <ChatMessageComponent
              message={{
                role: "assistant",
                content: streamingContent,
                citations: streamingCitations,
              }}
              isStreaming
              onCitationClick={onCitationClick}
            />
          </div>
        )}

        {isStreaming && !streamingContent && (
          <ChatThinkingIndicator progressStep={progressStep} />
        )}

        {isStreaming &&
          streamingContent &&
          progressStep &&
          progressStep.step === "citing" && (
            <div className="mt-2 mb-1 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              <span>{progressStep.detail}</span>
            </div>
          )}

        {!isStreaming && messages.length > 0 && (
          <div className="mt-4">
            <ChatSmartSuggestions
              smartSuggestions={smartSuggestions}
              smartSuggestionsLoading={smartSuggestionsLoading}
              fallbackSuggestions={suggestedQuestions}
              onSelect={handleSuggestionSelect}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showError && error && (
        <ChatErrorBanner
          error={error}
          onRetry={() => {
            retryLastMessage();
            setErrorDismissed(true);
          }}
          onDismiss={() => setErrorDismissed(true)}
        />
      )}

      <ChatInputBar
        inputValue={inputValue}
        placeholder={placeholder}
        compact={compact}
        isStreaming={isStreaming}
        textareaRef={textareaRef}
        inputWrapperRef={mention.inputWrapperRef}
        onChange={mention.handleInputChange}
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        onStopGenerating={stopGenerating}
        mentionActive={mention.mentionActive}
        mentionQuery={mention.mentionQuery}
        mentionPosition={mention.mentionPosition}
        onMentionSelect={mention.handleMentionSelect}
        onMentionClose={mention.handleMentionClose}
        isListening={isListening}
        isSpeechSupported={isSpeechSupported}
        onMicToggle={handleMicToggle}
      />
    </div>
  );
}

export default ChatPanel;
