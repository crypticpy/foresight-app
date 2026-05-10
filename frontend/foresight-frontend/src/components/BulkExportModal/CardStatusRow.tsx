/**
 * One row in the "Signals to Include" list. Shows the card name, its
 * position in the bulk-export order, and a Ready / Generating / No-brief
 * status chip.
 *
 * @module components/BulkExportModal/CardStatusRow
 */

import { AlertCircle, CheckCircle, GripVertical, Loader2 } from "lucide-react";

import { cn } from "../../lib/utils";
import type { BulkBriefCardStatus } from "../../lib/workstream-api";

export interface CardStatusRowProps {
  card: BulkBriefCardStatus;
  index: number;
}

export function CardStatusRow({ card, index }: CardStatusRowProps) {
  const isReady = card.has_brief && card.brief_status === "completed";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg",
        "border",
        isReady
          ? "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-700"
          : "bg-gray-50 dark:bg-dark-surface/50 border-gray-200 dark:border-gray-700 opacity-60",
      )}
    >
      <div className="flex items-center gap-2 flex-shrink-0">
        <GripVertical className="h-4 w-4 text-gray-300" />
        <span className="text-xs font-medium text-gray-400 w-4">{index}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium truncate",
            isReady
              ? "text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-gray-400",
          )}
        >
          {card.card_name}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isReady ? (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5" />
            Ready
          </span>
        ) : card.has_brief ? (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {card.brief_status || "Generating"}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <AlertCircle className="h-3.5 w-3.5" />
            No brief
          </span>
        )}
      </div>
    </div>
  );
}
