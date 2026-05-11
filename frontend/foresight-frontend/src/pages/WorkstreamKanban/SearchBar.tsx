/**
 * Free-text + pillar filter row used to narrow the kanban board to a
 * subset of its loaded cards. Filter state is owned by the composer; this
 * component is the controlled UI plus a "clear all" affordance and a count
 * summary when any filter is active.
 *
 * @module pages/WorkstreamKanban/SearchBar
 */

import { Filter, Search, X } from "lucide-react";
import type { KanbanStatus, WorkstreamCard } from "../../components/kanban";

interface SearchBarProps {
  searchQuery: string;
  filterPillar: string | null;
  availablePillars: string[];
  filteredCards: Record<KanbanStatus, WorkstreamCard[]>;
  totalCards: Record<KanbanStatus, WorkstreamCard[]>;
  onSearchChange: (value: string) => void;
  onPillarChange: (pillarId: string | null) => void;
  onClearFilters: () => void;
}

export function SearchBar({
  searchQuery,
  filterPillar,
  availablePillars,
  filteredCards,
  totalCards,
  onSearchChange,
  onPillarChange,
  onClearFilters,
}: SearchBarProps) {
  const hasActiveFilter = Boolean(searchQuery || filterPillar);

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-4 mb-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search cards by name or notes..."
            className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {availablePillars.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={filterPillar || ""}
              onChange={(e) => onPillarChange(e.target.value || null)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
            >
              <option value="">All Pillars</option>
              {availablePillars.map((pillarId) => (
                <option key={pillarId} value={pillarId}>
                  {pillarId}
                </option>
              ))}
            </select>
          </div>
        )}

        {hasActiveFilter && (
          <button
            onClick={onClearFilters}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
            Clear filters
          </button>
        )}

        {hasActiveFilter && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing {Object.values(filteredCards).flat().length} of{" "}
            {Object.values(totalCards).flat().length} cards
          </span>
        )}
      </div>
    </div>
  );
}
