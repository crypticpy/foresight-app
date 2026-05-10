/**
 * Slim banner shown when a conversation is auto-restored on mount —
 * gives the user a quick "Continuing from {time} · {title}" cue plus a
 * "Start new" escape hatch. Auto-dismisses after a few seconds (handled
 * by the parent hook); this component is purely presentational.
 *
 * @module components/Chat/components/ChatContinueBanner
 */

import { cn, formatRelativeTime } from "../../../lib/utils";

export interface ChatContinueBannerProps {
  conversationTitle: string;
  conversationUpdatedAt: string;
  onStartNew: () => void;
}

export function ChatContinueBanner({
  conversationTitle,
  conversationUpdatedAt,
  onStartNew,
}: ChatContinueBannerProps) {
  const truncatedTitle =
    conversationTitle.length > 40
      ? conversationTitle.slice(0, 40).trimEnd() + "…"
      : conversationTitle;

  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-1.5",
        "bg-blue-50/80 dark:bg-blue-900/15",
        "border-b border-blue-100 dark:border-blue-800/30",
        "animate-in fade-in-0 slide-in-from-top-1 duration-200",
      )}
    >
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
        <span>Continuing from </span>
        <span className="text-gray-600 dark:text-gray-300">
          {formatRelativeTime(conversationUpdatedAt)}
        </span>
        <span className="mx-1">&middot;</span>
        <span className="text-gray-600 dark:text-gray-300 font-medium">
          {truncatedTitle}
        </span>
      </p>
      <button
        type="button"
        onClick={onStartNew}
        className={cn(
          "shrink-0 ml-2 text-xs font-medium",
          "text-brand-blue hover:text-brand-dark-blue",
          "dark:text-blue-400 dark:hover:text-blue-300",
          "hover:underline focus:outline-none focus:underline",
          "transition-colors duration-150",
        )}
      >
        Start new
      </button>
    </div>
  );
}
