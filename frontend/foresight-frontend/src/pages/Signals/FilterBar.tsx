/**
 * Filter / sort / group / view-toggle bar above the signals list. Owns no
 * state of its own — parents pass setters down so URL or session sync can
 * happen at the composer level.
 *
 * @module pages/Signals/FilterBar
 */

import { Grid, Layers, List, Search } from "lucide-react";
import type { GroupBy, SortOption, SourceFilter, ViewMode } from "./types";

interface FilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedPillar: string;
  onPillarChange: (value: string) => void;
  uniquePillars: string[];
  selectedHorizon: string;
  onHorizonChange: (value: string) => void;
  sourceFilter: SourceFilter;
  onSourceFilterChange: (value: SourceFilter) => void;
  sortOption: SortOption;
  onSortChange: (value: SortOption) => void;
  qualityMin: number;
  onQualityMinChange: (value: number) => void;
  groupBy: GroupBy;
  onGroupByChange: (value: GroupBy) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  resultCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function FilterBar({
  searchTerm,
  onSearchChange,
  selectedPillar,
  onPillarChange,
  uniquePillars,
  selectedHorizon,
  onHorizonChange,
  sourceFilter,
  onSourceFilterChange,
  sortOption,
  onSortChange,
  qualityMin,
  onQualityMinChange,
  groupBy,
  onGroupByChange,
  viewMode,
  onViewModeChange,
  resultCount,
  hasActiveFilters,
  onClearFilters,
}: FilterBarProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="lg:col-span-2">
          <label
            htmlFor="signal-search"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              id="signal-search"
              className="pl-10 block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
              placeholder="Search your signals..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="signal-pillar"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Pillar
          </label>
          <select
            id="signal-pillar"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={selectedPillar}
            onChange={(e) => onPillarChange(e.target.value)}
          >
            <option value="">All Pillars</option>
            {uniquePillars.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="signal-horizon"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Horizon
          </label>
          <select
            id="signal-horizon"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={selectedHorizon}
            onChange={(e) => onHorizonChange(e.target.value)}
          >
            <option value="">All Horizons</option>
            <option value="H1">H1 (0-2 years)</option>
            <option value="H2">H2 (2-5 years)</option>
            <option value="H3">H3 (5+ years)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="signal-source"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Source
          </label>
          <select
            id="signal-source"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={sourceFilter}
            onChange={(e) =>
              onSourceFilterChange(e.target.value as SourceFilter)
            }
          >
            <option value="">All Sources</option>
            <option value="followed">Followed</option>
            <option value="created">Created by Me</option>
            <option value="workstream">In Workstreams</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="signal-sort"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Sort By
          </label>
          <select
            id="signal-sort"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={sortOption}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
          >
            <option value="recently_updated">Last Updated</option>
            <option value="date_followed">Date Followed</option>
            <option value="quality_desc">Quality Score</option>
            <option value="name_asc">Name (A-Z)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="quality-min"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Min Quality
            </label>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {qualityMin > 0 ? `>= ${qualityMin}` : "Any"}
            </span>
          </div>
          <input
            type="range"
            id="quality-min"
            min="0"
            max="100"
            step="5"
            value={qualityMin}
            onChange={(e) => onQualityMinChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-blue"
          />
        </div>

        <div>
          <label
            htmlFor="signal-group"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Group By
          </label>
          <div className="relative">
            <Layers className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <select
              id="signal-group"
              className="pl-10 block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
              value={groupBy}
              onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
            >
              <option value="none">No Grouping</option>
              <option value="pillar">Pillar</option>
              <option value="horizon">Horizon</option>
              <option value="workstream">Workstream</option>
            </select>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <button
            onClick={() => onViewModeChange("grid")}
            className={`p-2 rounded-md transition-colors ${
              viewMode === "grid"
                ? "bg-brand-light-blue text-brand-blue dark:bg-brand-blue/20"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <Grid className="h-5 w-5" />
          </button>
          <button
            onClick={() => onViewModeChange("list")}
            className={`p-2 rounded-md transition-colors ${
              viewMode === "list"
                ? "bg-brand-light-blue text-brand-blue dark:bg-brand-blue/20"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <List className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {resultCount} signal
          {resultCount !== 1 ? "s" : ""}
        </p>
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-sm text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
