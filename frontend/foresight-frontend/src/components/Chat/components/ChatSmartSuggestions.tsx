/**
 * Renders post-response smart suggestion chips. Each category (deeper,
 * compare, action, explore) gets its own left-border accent. Shows a
 * skeleton row while the fetch is in flight, and falls back to the
 * regular suggestion chips when the smart suggestions array is empty.
 *
 * @module components/Chat/components/ChatSmartSuggestions
 */

import { cn } from "../../../lib/utils";
import { ChatSuggestionChips } from "../ChatSuggestionChips";
import type { SmartSuggestion } from "../../../lib/chat-api";

interface CategoryStyle {
  icon: string;
  borderColor: string;
  hoverBorder: string;
}

const CATEGORY_CONFIG: Record<string, CategoryStyle> = {
  deeper: {
    icon: "⌕",
    borderColor: "border-l-blue-500",
    hoverBorder: "hover:border-blue-400 dark:hover:border-blue-500",
  },
  compare: {
    icon: "↔",
    borderColor: "border-l-purple-500",
    hoverBorder: "hover:border-purple-400 dark:hover:border-purple-500",
  },
  action: {
    icon: "→",
    borderColor: "border-l-amber-500",
    hoverBorder: "hover:border-amber-400 dark:hover:border-amber-500",
  },
  explore: {
    icon: "◈",
    borderColor: "border-l-teal-500",
    hoverBorder: "hover:border-teal-400 dark:hover:border-teal-500",
  },
};

const DEFAULT_CATEGORY: CategoryStyle = {
  icon: "⌕",
  borderColor: "border-l-blue-500",
  hoverBorder: "hover:border-blue-400 dark:hover:border-blue-500",
};

export interface ChatSmartSuggestionsProps {
  smartSuggestions: SmartSuggestion[];
  smartSuggestionsLoading: boolean;
  fallbackSuggestions: string[];
  onSelect: (text: string) => void;
}

export function ChatSmartSuggestions({
  smartSuggestions,
  smartSuggestionsLoading,
  fallbackSuggestions,
  onSelect,
}: ChatSmartSuggestionsProps) {
  if (smartSuggestions.length > 0) {
    return (
      <div
        className="flex flex-wrap gap-2"
        role="list"
        aria-label="Smart follow-up suggestions"
      >
        {smartSuggestions.map((suggestion, index) => {
          const config =
            CATEGORY_CONFIG[suggestion.category] ?? DEFAULT_CATEGORY;
          return (
            <button
              key={`${suggestion.category}-${suggestion.text}`}
              type="button"
              role="listitem"
              onClick={() => onSelect(suggestion.text)}
              className={cn(
                "inline-flex items-center gap-1.5",
                "px-3.5 py-2 rounded-lg",
                "text-sm text-gray-700 dark:text-gray-300",
                "border border-gray-200 dark:border-gray-600",
                "border-l-[3px]",
                config.borderColor,
                "bg-white dark:bg-dark-surface",
                "hover:bg-gray-50 dark:hover:bg-dark-surface-hover",
                config.hoverBorder,
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-1",
                "transition-all duration-200",
                "animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
                "cursor-pointer",
              )}
              style={{
                animationDelay: `${index * 60}ms`,
                animationFillMode: "both",
              }}
            >
              <span
                className="text-xs font-medium text-gray-400 dark:text-gray-500 shrink-0 w-4 text-center"
                aria-hidden="true"
              >
                {config.icon}
              </span>
              <span className="text-left">{suggestion.text}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (smartSuggestionsLoading) {
    return (
      <div className="flex flex-wrap gap-2" aria-label="Loading suggestions">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-9 rounded-lg animate-pulse",
              "bg-gray-200 dark:bg-dark-surface-elevated",
              i === 1 ? "w-52" : i === 2 ? "w-60" : "w-44",
            )}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  if (fallbackSuggestions.length > 0) {
    return (
      <ChatSuggestionChips
        suggestions={fallbackSuggestions}
        onSelect={onSelect}
      />
    );
  }

  return null;
}
