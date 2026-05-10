/**
 * Collapsible panel listing every saved version of a card's executive
 * brief. The currently-loaded version is highlighted; clicking a
 * different completed version invokes `onLoadVersion`.
 *
 * @module components/kanban/BriefPreviewModal/VersionHistoryPanel
 */

import { memo, useState } from "react";
import { ChevronDown, ChevronUp, History, Loader2 } from "lucide-react";

import { cn } from "../../../lib/utils";
import type { BriefVersionListItem } from "../../../lib/workstream-api";

export interface VersionHistoryPanelProps {
  versions: BriefVersionListItem[];
  currentBriefId?: string;
  onLoadVersion: (briefId: string) => void;
  isLoading?: boolean;
}

export const VersionHistoryPanel = memo(function VersionHistoryPanel({
  versions,
  currentBriefId,
  onLoadVersion,
  isLoading,
}: VersionHistoryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (versions.length <= 1) return null;

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-dark-surface/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Version History
          </span>
          <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full">
            {versions.length} versions
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="divide-y divide-gray-200 dark:divide-gray-600 max-h-48 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            versions.map((version) => {
              const isCurrentVersion = version.id === currentBriefId;
              const versionDate = version.generated_at
                ? new Date(version.generated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Pending";

              return (
                <button
                  key={version.id}
                  onClick={() => !isCurrentVersion && onLoadVersion(version.id)}
                  disabled={isCurrentVersion || version.status !== "completed"}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
                    isCurrentVersion
                      ? "bg-brand-blue/5 dark:bg-brand-blue/10"
                      : version.status === "completed"
                        ? "hover:bg-gray-50 dark:hover:bg-gray-700/30"
                        : "opacity-50 cursor-not-allowed",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded",
                        isCurrentVersion
                          ? "bg-brand-blue text-white"
                          : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300",
                      )}
                    >
                      v{version.version}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white truncate">
                        {versionDate}
                      </p>
                      {version.summary && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {version.summary.substring(0, 60)}...
                        </p>
                      )}
                    </div>
                  </div>
                  {isCurrentVersion && (
                    <span className="flex-shrink-0 text-xs text-brand-blue dark:text-brand-light-blue font-medium">
                      Current
                    </span>
                  )}
                  {version.status !== "completed" && (
                    <span className="flex-shrink-0 text-xs text-gray-500 capitalize">
                      {version.status}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});
