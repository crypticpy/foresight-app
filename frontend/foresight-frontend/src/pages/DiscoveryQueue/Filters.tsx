/**
 * Search + pillar + confidence filters card for the discovery queue, plus a
 * Select-All / Deselect-All toggle row underneath. All state is owned by the
 * parent composer — this is a presentational component.
 *
 * @module pages/DiscoveryQueue/Filters
 */

import { Search } from "lucide-react";
import type { ConfidenceFilter, Pillar } from "./types";

export interface FiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedPillar: string;
  onPillarChange: (value: string) => void;
  confidenceFilter: ConfidenceFilter;
  onConfidenceChange: (value: ConfidenceFilter) => void;
  pillars: Pillar[];
  filteredCount: number;
  totalCount: number;
  /** Number of selected cards; toggles the Select-All vs Deselect-All label. */
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function Filters({
  searchTerm,
  onSearchChange,
  selectedPillar,
  onPillarChange,
  confidenceFilter,
  onConfidenceChange,
  pillars,
  filteredCount,
  totalCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
}: FiltersProps) {
  const allSelected = filteredCount > 0 && selectedCount === filteredCount;

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-4 sm:p-6 mb-4 sm:mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <label
            htmlFor="search"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              id="search"
              className="pl-10 block w-full min-h-[44px] sm:min-h-0 border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue text-base sm:text-sm"
              placeholder="Search pending signals..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="pillar"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Pillar
          </label>
          <select
            id="pillar"
            className="block w-full min-h-[44px] sm:min-h-0 border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue text-base sm:text-sm"
            value={selectedPillar}
            onChange={(e) => onPillarChange(e.target.value)}
          >
            <option value="">All Pillars</option>
            {pillars.map((pillar) => (
              <option key={pillar.id} value={pillar.id}>
                {pillar.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="confidence"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Confidence
          </label>
          <select
            id="confidence"
            className="block w-full min-h-[44px] sm:min-h-0 border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue text-base sm:text-sm"
            value={confidenceFilter}
            onChange={(e) =>
              onConfidenceChange(e.target.value as ConfidenceFilter)
            }
          >
            <option value="all">All Levels</option>
            <option value="high">High (90%+)</option>
            <option value="medium">Medium (70-90%)</option>
            <option value="low">Low (&lt;70%)</option>
          </select>
        </div>
      </div>

      <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            {filteredCount} of {totalCount} cards
          </p>
          {filteredCount > 0 && (
            <button
              onClick={allSelected ? onClearSelection : onSelectAll}
              className="min-h-[44px] px-2 py-2 -my-2 text-xs sm:text-sm text-brand-blue hover:text-brand-dark-blue dark:hover:text-brand-light-blue transition-colors active:scale-95"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
