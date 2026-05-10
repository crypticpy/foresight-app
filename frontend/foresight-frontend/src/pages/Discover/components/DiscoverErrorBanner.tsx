/**
 * Error banner with a "Try again" retry and a dismiss button. Rendered above
 * the cards grid when `useCardLoader` reports an error.
 *
 * @module pages/Discover/components/DiscoverErrorBanner
 */

import { AlertTriangle, RefreshCw, X } from "lucide-react";

export interface DiscoverErrorBannerProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function DiscoverErrorBanner({
  message,
  onRetry,
  onDismiss,
}: DiscoverErrorBannerProps) {
  return (
    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-red-700 dark:text-red-300">
            {message}
          </p>
          <button
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
        <button
          onClick={onDismiss}
          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
