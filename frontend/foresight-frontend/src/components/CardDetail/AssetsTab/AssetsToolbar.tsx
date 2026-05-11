/**
 * Search input + type-filter dropdown + manual-refresh button. Used as
 * the sticky header of the AssetsTab list.
 *
 * @module components/CardDetail/AssetsTab/AssetsToolbar
 */

import { ChevronDown, Filter, History, Search } from "lucide-react";

import { cn } from "../../../lib/utils";

import { ASSET_TYPE_CONFIG } from "./constants";
import type { AssetType } from "./types";

export interface AssetsToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filterType: AssetType | "all";
  showFilters: boolean;
  onToggleFilters: () => void;
  onFilterChange: (type: AssetType | "all") => void;
  onRefresh?: () => void;
}

export function AssetsToolbar({
  searchQuery,
  onSearchChange,
  filterType,
  showFilters,
  onToggleFilters,
  onFilterChange,
  onRefresh,
}: AssetsToolbarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search assets..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={cn(
            "w-full pl-9 pr-4 py-2 text-sm rounded-lg",
            "border border-gray-200 dark:border-gray-700",
            "bg-white dark:bg-dark-surface",
            "text-gray-900 dark:text-white",
            "placeholder-gray-500 dark:placeholder-gray-400",
            "focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          )}
        />
      </div>

      <div className="relative">
        <button
          onClick={onToggleFilters}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg",
            "border border-gray-200 dark:border-gray-700",
            "bg-white dark:bg-dark-surface",
            "text-gray-700 dark:text-gray-300",
            "hover:bg-gray-50 dark:hover:bg-gray-700",
            "transition-colors",
          )}
        >
          <Filter className="h-4 w-4" />
          {filterType === "all"
            ? "All Types"
            : ASSET_TYPE_CONFIG[filterType].label}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              showFilters && "rotate-180",
            )}
          />
        </button>

        {showFilters && (
          <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
            <button
              onClick={() => onFilterChange("all")}
              className={cn(
                "w-full px-4 py-2 text-sm text-left",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                filterType === "all" && "bg-gray-100 dark:bg-gray-700",
              )}
            >
              All Types
            </button>
            {Object.entries(ASSET_TYPE_CONFIG).map(([type, config]) => (
              <button
                key={type}
                onClick={() => onFilterChange(type as AssetType)}
                className={cn(
                  "w-full px-4 py-2 text-sm text-left flex items-center gap-2",
                  "hover:bg-gray-100 dark:hover:bg-gray-700",
                  filterType === type && "bg-gray-100 dark:bg-gray-700",
                )}
              >
                <config.icon
                  className="h-4 w-4"
                  style={{ color: config.color }}
                />
                {config.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {onRefresh && (
        <button
          onClick={onRefresh}
          className={cn(
            "p-2 rounded-lg",
            "border border-gray-200 dark:border-gray-700",
            "bg-white dark:bg-dark-surface",
            "text-gray-500 dark:text-gray-400",
            "hover:bg-gray-50 dark:hover:bg-gray-700",
            "transition-colors",
          )}
          title="Refresh"
        >
          <History className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
