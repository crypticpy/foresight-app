/**
 * One row of the chat transcript. Renders a user or assistant message
 * with role-specific bubble styling, parses markdown for assistant
 * answers, shows citations + a metadata footer, and exposes hover
 * actions (copy, plus the actions cluster from `ChatMessageActions`).
 *
 * The heavy markdown parser lives in `./ChatMessage/markdown` and the
 * tone-keyword heuristic in `./ChatMessage/tone`. This file is the
 * presentational shell.
 *
 * @module components/Chat/ChatMessage
 */

import { useCallback, useMemo, useState } from "react";
import { Check, Copy, FileText, Sparkles } from "lucide-react";

import { cn } from "../../lib/utils";
import type { Citation } from "../../lib/chat-api";
import { ChatCitation } from "./ChatCitation";
import { ChatMessageActions } from "./ChatMessageActions";
import { parseMarkdown } from "./ChatMessage/markdown";
import { detectToneBorder } from "./ChatMessage/tone";

export interface ChatMessageProps {
  /** The message data to render */
  message: {
    id?: string;
    role: "user" | "assistant";
    content: string;
    citations: Citation[];
    created_at?: string;
    metadata?: {
      source_count?: number;
      citation_count?: number;
      signal_name?: string;
      workstream_name?: string;
      matched_cards?: number;
      card_count?: number;
    };
  };
  /** Whether this message is currently being streamed */
  isStreaming?: boolean;
  /** Callback when a citation is clicked */
  onCitationClick?: (citation: Citation) => void;
}

export function ChatMessage({
  message,
  isStreaming = false,
  onCitationClick,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);
  const isUser = message.role === "user";

  const formattedTime = useMemo(() => {
    if (!message.created_at) return "";
    try {
      return new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, [message.created_at]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [message.content]);

  const renderedContent = useMemo(
    () => parseMarkdown(message.content, message.citations, onCitationClick),
    [message.content, message.citations, onCitationClick],
  );

  const toneBorder = useMemo(
    () => (!isUser && !isStreaming ? detectToneBorder(message.content) : ""),
    [message.content, isUser, isStreaming],
  );

  return (
    <div
      className={cn(
        "flex gap-2.5 animate-slide-up-fade-in",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      {!isUser && (
        <div
          className={cn(
            "flex items-center justify-center shrink-0",
            "w-7 h-7 rounded-full mt-0.5",
            "bg-brand-blue/10 dark:bg-brand-blue/20",
          )}
          aria-hidden="true"
        >
          <Sparkles className="h-3.5 w-3.5 text-brand-blue" />
        </div>
      )}

      <div
        className={cn(
          "relative group max-w-[85%] sm:max-w-[75%]",
          isUser ? "ml-auto" : "mr-auto",
        )}
      >
        <div
          className={cn(
            "px-4 py-2.5",
            isUser
              ? "bg-brand-blue text-white rounded-2xl rounded-br-md"
              : cn(
                  "bg-gray-100 dark:bg-dark-surface-elevated rounded-2xl rounded-bl-md",
                  toneBorder,
                ),
          )}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          ) : (
            <div className="space-y-1">{renderedContent}</div>
          )}

          {isStreaming && (
            <span
              className="inline-block w-2 h-4 ml-0.5 bg-brand-blue animate-smooth-pulse rounded-sm align-text-bottom"
              aria-label="Generating response"
            />
          )}
        </div>

        {!isUser && message.citations.length > 0 && !isStreaming && (
          <div className="mt-2 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 animate-fade-in">
              Sources
            </p>
            <div className="flex flex-wrap gap-1.5">
              {message.citations.map((citation, index) => (
                <div
                  key={`${citation.index}-${citation.card_id || citation.source_id || citation.title}`}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <ChatCitation citation={citation} onClick={onCitationClick} />
                </div>
              ))}
            </div>
          </div>
        )}

        {!isUser && message.metadata && !isStreaming && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
            <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>
              Based on {message.metadata.source_count ?? 0} sources
              {message.metadata.matched_cards
                ? ` across ${message.metadata.matched_cards} signals`
                : ""}
              {message.metadata.card_count
                ? ` from ${message.metadata.card_count} signals`
                : ""}
            </span>
          </div>
        )}

        {!isUser && !isStreaming && (
          <div
            className={cn(
              "absolute -top-2 -right-2",
              "flex items-center gap-0.5",
              "opacity-0 group-hover:opacity-100",
              "transition-all duration-200",
            )}
          >
            <ChatMessageActions
              content={message.content}
              messageId={message.id}
            />
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                "inline-flex items-center justify-center",
                "w-7 h-7 rounded-md",
                "bg-white dark:bg-dark-surface-elevated",
                "border border-gray-200 dark:border-gray-600",
                "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
                "shadow-sm",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue",
                "transition-colors duration-200",
              )}
              aria-label={copied ? "Copied to clipboard" : "Copy message"}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-brand-green" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}

        {showTimestamp && formattedTime && (
          <div
            className={cn(
              "mt-1 text-[10px] text-gray-400 dark:text-gray-500",
              isUser ? "text-right" : "text-left",
              "animate-in fade-in-0 duration-150",
            )}
          >
            {formattedTime}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatMessage;
