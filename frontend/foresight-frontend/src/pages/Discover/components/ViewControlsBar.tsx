/**
 * Row that sits between the filters panel and the cards grid: result-count
 * label + Save Search button on the left, grid/list view toggle on the right.
 *
 * @module pages/Discover/components/ViewControlsBar
 */

import { Bookmark, Grid, List, Loader2 } from "lucide-react";

export interface ViewControlsBarProps {
  visibleCount: number;
  totalCount: number;
  isFilterPending: boolean;
  /** When true, "of N" suffix renders next to the visible count. */
  hasQualityFilter: boolean;
  viewMode: "grid" | "list";
  onSetViewMode: (mode: "grid" | "list") => void;
  onOpenSaveSearch: () => void;
}

export function ViewControlsBar({
  visibleCount,
  totalCount,
  isFilterPending,
  hasQualityFilter,
  viewMode,
  onSetViewMode,
  onOpenSaveSearch,
}: ViewControlsBarProps) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {visibleCount}
          {hasQualityFilter ? ` of ${totalCount}` : ""} signals
        </p>
        {isFilterPending && (
          <span className="inline-flex items-center gap-1 text-xs text-brand-blue">
            <Loader2 className="h-3 w-3 animate-spin" />
            Updating...
          </span>
        )}
      </div>
      <div className="flex items-center space-x-3">
        <button
          onClick={onOpenSaveSearch}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-blue bg-brand-light-blue dark:bg-brand-blue/20 border border-brand-blue/30 rounded-md hover:bg-brand-blue hover:text-white dark:hover:bg-brand-blue transition-colors"
        >
          <Bookmark className="h-4 w-4" />
          Save Search
        </button>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onSetViewMode("grid")}
            className={`p-2 rounded-md transition-colors ${
              viewMode === "grid"
                ? "bg-brand-light-blue text-brand-blue dark:bg-brand-blue/20"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <Grid className="h-4 w-4" />
          </button>
          <button
            onClick={() => onSetViewMode("list")}
            className={`p-2 rounded-md transition-colors ${
              viewMode === "list"
                ? "bg-brand-light-blue text-brand-blue dark:bg-brand-blue/20"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
