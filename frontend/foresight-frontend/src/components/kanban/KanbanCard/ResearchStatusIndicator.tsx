/**
 * Inline status indicator for a card's research task: shows spinner +
 * task label while queued/processing, a green "Research Ready" pill when
 * complete, and a red "Failed" pill otherwise.
 *
 * @module components/kanban/KanbanCard/ResearchStatusIndicator
 */

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { cn } from "../../../lib/utils";
import { Tooltip } from "../../ui/Tooltip";
import type { WorkstreamCard } from "../types";

export interface ResearchStatusIndicatorProps {
  status: NonNullable<WorkstreamCard["research_status"]>;
  isDragOverlay: boolean;
}

export function ResearchStatusIndicator({
  status,
  isDragOverlay,
}: ResearchStatusIndicatorProps) {
  if (!status.status) return null;

  const isActive = status.status === "queued" || status.status === "processing";

  return (
    <div
      className={cn(
        "flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700",
        isActive && "animate-pulse",
      )}
    >
      {isActive && (
        <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs font-medium">
            {status.task_type === "deep_research" ? "Deep Dive" : "Updating"}...
          </span>
        </div>
      )}
      {status.status === "completed" && (
        <Tooltip
          content="Research complete - click to view results"
          side="top"
          disabled={isDragOverlay}
        >
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 cursor-pointer hover:text-green-700 dark:hover:text-green-300 transition-colors">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Research Ready</span>
          </div>
        </Tooltip>
      )}
      {status.status === "failed" && (
        <Tooltip
          content="Research failed - try again"
          side="top"
          disabled={isDragOverlay}
        >
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Failed</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}
