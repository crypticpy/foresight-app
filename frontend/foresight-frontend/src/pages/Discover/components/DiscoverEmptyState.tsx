/**
 * Empty-state panel shown when the cards loader returned no rows. Branches
 * across three scenarios (semantic-no-match / filters-no-match / library-
 * empty) plus the special `?filter=new` "no new signals" message. Offers
 * recovery actions: clear all filters and/or switch off semantic search.
 *
 * @module pages/Discover/components/DiscoverEmptyState
 */

import { Filter, Inbox, Search, Sparkles, X } from "lucide-react";

export interface DiscoverEmptyStateProps {
  searchTerm: string;
  useSemanticSearch: boolean;
  hasActiveFilters: boolean;
  quickFilter: string;
  onClearFilters: () => void;
  onDisableSemantic: () => void;
}

export function DiscoverEmptyState({
  searchTerm,
  useSemanticSearch,
  hasActiveFilters,
  quickFilter,
  onClearFilters,
  onDisableSemantic,
}: DiscoverEmptyStateProps) {
  const semanticNoMatch = useSemanticSearch && searchTerm;
  const filtersActive = hasActiveFilters || searchTerm;
  const showClearButton = filtersActive && !quickFilter;
  const showStandardSearchButton = useSemanticSearch && searchTerm;

  let icon: React.ReactNode;
  if (semanticNoMatch) {
    icon = <Sparkles className="mx-auto h-12 w-12 text-gray-400" />;
  } else if (filtersActive) {
    icon = <Filter className="mx-auto h-12 w-12 text-gray-400" />;
  } else {
    icon = <Inbox className="mx-auto h-12 w-12 text-gray-400" />;
  }

  let title: string;
  if (quickFilter === "new") {
    title = "No New Signals This Week";
  } else if (semanticNoMatch) {
    title = "No Semantic Matches Found";
  } else if (filtersActive) {
    title = "No Signals Match Your Filters";
  } else {
    title = "No Signals Available";
  }

  let description: string;
  if (quickFilter === "new") {
    description = "Check back soon for newly discovered intelligence signals.";
  } else if (semanticNoMatch) {
    description = `No signals matched your semantic search for "${searchTerm}". Try different keywords, or switch to standard text search.`;
  } else if (searchTerm) {
    description = `No signals matched your search for "${searchTerm}". Try different keywords or enable semantic search for broader matches.`;
  } else if (hasActiveFilters) {
    description =
      "Your current filter combination returned no results. Try removing some filters or adjusting score thresholds.";
  } else {
    description =
      "The intelligence library is empty. Signals will appear here as they are discovered.";
  }

  return (
    <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
      {icon}

      <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        {description}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {showClearButton && (
          <button
            onClick={onClearFilters}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-4 w-4 mr-2" />
            Clear All Filters
          </button>
        )}
        {showStandardSearchButton && (
          <button
            onClick={onDisableSemantic}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Search className="h-4 w-4 mr-2" />
            Try Standard Search
          </button>
        )}
      </div>
    </div>
  );
}
