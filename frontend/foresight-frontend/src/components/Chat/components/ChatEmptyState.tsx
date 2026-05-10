/**
 * Initial empty-state shown before any messages exist in the conversation.
 * Renders the Sparkles icon, configurable title/description, the seed
 * suggestion chips, and a keyboard-hint footer ("Press / to focus").
 *
 * @module components/Chat/components/ChatEmptyState
 */

import { Sparkles } from "lucide-react";
import { cn } from "../../../lib/utils";
import { ChatSuggestionChips } from "../ChatSuggestionChips";

export interface ChatEmptyStateProps {
  title: string;
  description: string;
  compact: boolean;
  suggestedQuestions: string[];
  onSuggestionSelect: (question: string) => void;
}

export function ChatEmptyState({
  title,
  description,
  compact,
  suggestedQuestions,
  onSuggestionSelect,
}: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
      <div
        className={cn(
          "flex items-center justify-center w-12 h-12 rounded-full mb-4",
          "bg-brand-blue/10 dark:bg-brand-blue/20",
        )}
      >
        <Sparkles className="h-6 w-6 text-brand-blue" aria-hidden="true" />
      </div>
      <h3
        className={cn(
          "font-semibold text-gray-900 dark:text-gray-100",
          compact ? "text-base" : "text-lg",
        )}
      >
        {title}
      </h3>
      <p
        className={cn(
          "mt-2 text-gray-500 dark:text-gray-400 max-w-md",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {description}
      </p>

      {suggestedQuestions.length > 0 && (
        <div className="mt-6 w-full max-w-lg">
          <ChatSuggestionChips
            suggestions={suggestedQuestions}
            onSelect={onSuggestionSelect}
          />
        </div>
      )}

      <p className="mt-4 text-[10px] text-gray-300 dark:text-gray-600">
        Press{" "}
        <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-dark-surface text-gray-500 dark:text-gray-400 font-mono">
          /
        </kbd>{" "}
        to focus
      </p>
    </div>
  );
}
