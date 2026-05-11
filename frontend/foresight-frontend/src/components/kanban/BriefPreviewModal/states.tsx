/**
 * The two transient render states for the brief modal: the
 * `LoadingState` shown while generation is in flight, and the
 * `ErrorState` shown when generation fails (with an optional retry
 * button).
 *
 * @module components/kanban/BriefPreviewModal/states
 */

import { memo } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

export const LoadingState = memo(function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <Loader2
        className="h-12 w-12 text-brand-blue animate-spin mb-4"
        aria-hidden="true"
      />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Generating Executive Brief
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-sm">
        Analyzing research data and synthesizing key insights. This may take a
        moment...
      </p>
    </div>
  );
});

export interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
}

export const ErrorState = memo(function ErrorState({
  error,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div
        className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4"
        aria-hidden="true"
      >
        <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Generation Failed
      </h3>
      <p className="text-sm text-red-600 dark:text-red-400 text-center max-w-sm mb-4">
        {error}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-blue hover:bg-brand-dark-blue rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 dark:focus:ring-offset-dark-surface"
        >
          Try Again
        </button>
      )}
    </div>
  );
});
