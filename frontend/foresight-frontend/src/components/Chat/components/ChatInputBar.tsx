/**
 * Composite chat input bar: auto-growing <textarea>, optional voice
 * (speech-to-text) toggle, mention-autocomplete dropdown positioned
 * relative to the wrapper, and the Send/Stop button. Owns the
 * auto-grow effect; everything else (input value, mention state,
 * voice state, submit handler) is supplied by the parent.
 *
 * @module components/Chat/components/ChatInputBar
 */

import React, { useEffect, type KeyboardEvent, type RefObject } from "react";
import { Send, StopCircle } from "lucide-react";
import { cn } from "../../../lib/utils";
import { ChatMentionAutocomplete } from "../ChatMentionAutocomplete";
import type { MentionResult } from "../../../lib/chat-api";

export interface ChatInputBarProps {
  inputValue: string;
  placeholder: string;
  compact: boolean;
  isStreaming: boolean;

  textareaRef: RefObject<HTMLTextAreaElement>;
  inputWrapperRef: RefObject<HTMLDivElement>;

  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onStopGenerating: () => void;

  // Mention autocomplete dropdown
  mentionActive: boolean;
  mentionQuery: string;
  mentionPosition: { top: number; left: number };
  onMentionSelect: (mention: MentionResult) => void;
  onMentionClose: () => void;

  // Voice input
  isListening: boolean;
  isSpeechSupported: boolean;
  onMicToggle: () => void;
}

export function ChatInputBar({
  inputValue,
  placeholder,
  compact,
  isStreaming,
  textareaRef,
  inputWrapperRef,
  onChange,
  onKeyDown,
  onSubmit,
  onStopGenerating,
  mentionActive,
  mentionQuery,
  mentionPosition,
  onMentionSelect,
  onMentionClose,
  isListening,
  isSpeechSupported,
  onMicToggle,
}: ChatInputBarProps) {
  // Auto-grow the textarea up to a max height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const maxHeight = compact ? 120 : 160;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [inputValue, compact, textareaRef]);

  return (
    <div
      className={cn(
        "border-t border-gray-200 dark:border-gray-700",
        "bg-white dark:bg-dark-surface-deep",
        compact ? "px-3 py-3" : "px-4 py-3 sm:px-6",
      )}
    >
      <div
        ref={inputWrapperRef}
        className={cn(
          "relative",
          "flex items-end gap-2",
          "bg-gray-50 dark:bg-dark-surface",
          "border border-gray-200 dark:border-gray-600",
          "rounded-xl",
          "focus-within:ring-2 focus-within:ring-brand-blue focus-within:border-transparent",
          "transition-all duration-200",
          compact ? "px-3 py-2" : "px-4 py-3",
        )}
      >
        {mentionActive && mentionQuery.length > 0 && (
          <ChatMentionAutocomplete
            query={mentionQuery}
            position={mentionPosition}
            onSelect={onMentionSelect}
            onClose={onMentionClose}
          />
        )}

        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          maxLength={4000}
          disabled={isStreaming}
          className={cn(
            "flex-1 resize-none bg-transparent",
            "text-sm text-gray-900 dark:text-gray-100",
            "placeholder-gray-400 dark:placeholder-gray-500",
            "focus:outline-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          aria-label="Chat message input. Type @ to mention signals or workstreams."
        />

        <div className="flex items-center gap-1.5 shrink-0">
          {isSpeechSupported && !isStreaming && (
            <button
              type="button"
              onClick={onMicToggle}
              className={cn(
                "inline-flex items-center justify-center",
                "w-8 h-8 rounded-lg",
                "focus:outline-none focus:ring-2 focus:ring-offset-1",
                "transition-colors duration-200",
                isListening
                  ? [
                      "bg-red-500 text-white",
                      "hover:bg-red-600",
                      "focus:ring-red-400",
                      "animate-pulse",
                    ]
                  : [
                      "text-gray-400 dark:text-gray-500",
                      "hover:text-gray-600 dark:hover:text-gray-300",
                      "hover:bg-gray-200/60 dark:hover:bg-gray-700/60",
                      "focus:ring-brand-blue",
                    ],
              )}
              aria-label={
                isListening ? "Stop voice input" : "Start voice input"
              }
              title={isListening ? "Stop voice input" : "Voice input"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <rect x="9" y="1" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="8" y1="21" x2="16" y2="21" />
              </svg>
            </button>
          )}

          <span
            className={cn(
              "hidden sm:inline text-[10px] text-gray-400 dark:text-gray-500",
              "whitespace-nowrap",
            )}
          >
            Enter to send
          </span>

          {isStreaming ? (
            <button
              type="button"
              onClick={onStopGenerating}
              className={cn(
                "inline-flex items-center justify-center",
                "w-8 h-8 rounded-lg",
                "bg-red-500 text-white",
                "hover:bg-red-600",
                "focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1",
                "transition-colors duration-200",
              )}
              aria-label="Stop generating"
            >
              <StopCircle className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!inputValue.trim()}
              className={cn(
                "inline-flex items-center justify-center",
                "w-8 h-8 rounded-lg",
                "bg-brand-blue text-white",
                "hover:bg-brand-dark-blue",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-1",
                "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-blue",
                "transition-colors duration-200",
              )}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
