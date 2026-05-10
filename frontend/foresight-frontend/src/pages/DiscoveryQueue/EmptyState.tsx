/**
 * Empty-state panel for the discovery queue. Renders one of two messages:
 * "All caught up" when there are no pending cards at all, or "No matching
 * signals" + a Clear-Filters button when filters have narrowed everything out.
 *
 * @module pages/DiscoveryQueue/EmptyState
 */

import { Link } from "react-router-dom";
import { CheckCircle, Inbox, RefreshCw } from "lucide-react";

export interface EmptyStateProps {
  /** True when there are no pending cards regardless of filters. */
  queueIsEmpty: boolean;
  onClearFilters: () => void;
}

export function EmptyState({ queueIsEmpty, onClearFilters }: EmptyStateProps) {
  if (queueIsEmpty) {
    return (
      <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
        <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle className="h-10 w-10 text-green-500 dark:text-green-400" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
          All Caught Up!
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
          Great work! You&apos;ve reviewed all pending discoveries. Check back
          later for new AI-discovered signals.
        </p>
        <Link
          to="/discover"
          className="mt-6 inline-flex items-center justify-center min-h-[44px] px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-brand-dark-blue transition-colors active:scale-95"
        >
          Browse Intelligence Library
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
      <Inbox className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
        No Matching Signals
      </h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
        No signals match your current filters. Try adjusting your search or
        filter settings.
      </p>
      <button
        onClick={onClearFilters}
        className="mt-4 inline-flex items-center justify-center min-h-[44px] px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover transition-colors active:scale-95"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Clear All Filters
      </button>
    </div>
  );
}
