/**
 * Inline error banner with Retry and Dismiss actions. Mounted between
 * the messages area and the input bar; the parent controls visibility
 * via the `error` prop being non-null.
 *
 * @module components/Chat/components/ChatErrorBanner
 */

import { AlertCircle, X } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface ChatErrorBannerProps {
  error: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function ChatErrorBanner({
  error,
  onRetry,
  onDismiss,
}: ChatErrorBannerProps) {
  return (
    <div
      className={cn(
        "mx-4 mb-2 flex items-start gap-2 px-3 py-2.5 rounded-lg",
        "bg-red-50 dark:bg-red-900/20",
        "border border-red-200 dark:border-red-800",
        "text-sm text-red-700 dark:text-red-400",
      )}
      role="alert"
    >
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1">
        <span>{error}</span>
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "ml-2 text-xs font-medium",
            "text-brand-blue hover:text-brand-dark-blue dark:text-blue-400 dark:hover:text-blue-300",
            "hover:underline focus:outline-none focus:underline",
          )}
        >
          Retry
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className={cn(
          "p-0.5 rounded",
          "text-red-400 hover:text-red-600 dark:hover:text-red-300",
          "hover:bg-red-100 dark:hover:bg-red-800/30",
          "focus:outline-none focus:ring-1 focus:ring-red-400",
          "transition-colors duration-200",
        )}
        aria-label="Dismiss error"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
