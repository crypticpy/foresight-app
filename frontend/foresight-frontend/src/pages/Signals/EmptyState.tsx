/**
 * Empty-state card for the Signals page: shows a "no matches" message when
 * filters are active, and a "discover signals" CTA otherwise.
 *
 * @module pages/Signals/EmptyState
 */

import { Link } from "react-router-dom";
import { Compass, Filter } from "lucide-react";

export function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="text-center py-16 bg-white dark:bg-dark-surface rounded-xl shadow-sm">
      {hasFilters ? (
        <>
          <Filter className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No Matching Signals
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Try adjusting your filters to see more results.
          </p>
        </>
      ) : (
        <>
          <Compass className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No Signals Yet
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            You haven&apos;t followed any signals yet. Discover signals to start
            building your intelligence hub.
          </p>
          <Link
            to="/discover"
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white font-medium rounded-xl transition-colors"
          >
            <Compass className="w-5 h-5" />
            Discover Signals
          </Link>
        </>
      )}
    </div>
  );
}
