/**
 * Collapsible recent-searches list rendered inside the FiltersPanel footer.
 * Clicking an entry replays its saved-search config; per-entry delete and
 * "Clear all" come from the `useSearchHistory` hook.
 *
 * @module pages/Discover/components/SearchHistoryPanel
 */

import {
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import type { SavedSearchQueryConfig } from "../../../lib/discovery-api";
import { formatHistoryTime, getHistoryDescription } from "../utils";

export interface SearchHistoryEntry {
  id: string;
  query_config: SavedSearchQueryConfig;
  result_count: number;
  executed_at: string;
}

export interface SearchHistoryPanelProps {
  history: SearchHistoryEntry[];
  isExpanded: boolean;
  isLoading: boolean;
  deletingId: string | null;
  onToggleExpanded: () => void;
  onSelectEntry: (config: SavedSearchQueryConfig) => void;
  onDeleteEntry: (id: string, event: React.MouseEvent) => void;
  onClearAll: () => void;
}

export function SearchHistoryPanel({
  history,
  isExpanded,
  isLoading,
  deletingId,
  onToggleExpanded,
  onSelectEntry,
  onDeleteEntry,
  onClearAll,
}: SearchHistoryPanelProps) {
  if (history.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
      <button
        onClick={onToggleExpanded}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Recent Searches ({history.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
          <div className="flex justify-end mb-2">
            <button
              onClick={onClearAll}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          </div>

          {history.map((entry) => (
            <div
              key={entry.id}
              onClick={() => onSelectEntry(entry.query_config)}
              className="group flex items-start justify-between gap-2 p-2 rounded-md border border-gray-200 dark:border-gray-600 hover:border-brand-blue hover:bg-brand-light-blue/50 dark:hover:bg-brand-blue/10 cursor-pointer transition-all duration-200"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectEntry(entry.query_config);
                }
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {entry.query_config.use_vector_search && (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium bg-extended-purple/10 text-extended-purple">
                      <Sparkles className="h-2.5 w-2.5" />
                      AI
                    </span>
                  )}
                  <span className="text-sm text-gray-900 dark:text-white truncate">
                    {getHistoryDescription(entry.query_config)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">
                    {formatHistoryTime(entry.executed_at)}
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-400">
                    {entry.result_count} result
                    {entry.result_count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              <button
                onClick={(e) => onDeleteEntry(entry.id, e)}
                disabled={deletingId === entry.id}
                className="p-1 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 shrink-0"
                title="Remove from history"
              >
                {deletingId === entry.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
