/**
 * Bottom action row shown only on inbox-column cards: Approve Review
 * (when the card is pending content review), Accept (→ working), and
 * Dismiss (→ archived). Each button surfaces its keyboard shortcut.
 *
 * @module components/kanban/KanbanCard/InboxQuickActions
 */

import { Check, CheckCircle, X } from "lucide-react";

import { Tooltip } from "../../ui/Tooltip";
import type { CardActionCallbacks } from "../types";

export interface InboxQuickActionsProps {
  cardId: string;
  isDragOverlay: boolean;
  showNeedsReview: boolean;
  cardActions: CardActionCallbacks;
  onApproveLocal: () => void;
}

export function InboxQuickActions({
  cardId,
  isDragOverlay,
  showNeedsReview,
  cardActions,
  onApproveLocal,
}: InboxQuickActionsProps) {
  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
      {showNeedsReview && cardActions.onApproveReview && (
        <Tooltip
          content="Approve content quality"
          side="top"
          disabled={isDragOverlay}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onApproveLocal();
              cardActions.onApproveReview?.(cardId);
            }}
            className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-md transition-colors"
            title="Approve Review"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Approve
          </button>
        </Tooltip>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          cardActions.onMoveToColumn?.(cardId, "working");
        }}
        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-md transition-colors"
        title="Move to Working (E or A)"
      >
        <Check className="h-3.5 w-3.5" />
        Accept
        <kbd className="ml-1 px-1 text-[10px] font-mono bg-white/60 dark:bg-black/20 rounded border border-green-200 dark:border-green-800">
          E
        </kbd>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          cardActions.onMoveToColumn?.(cardId, "archived");
        }}
        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-md transition-colors"
        title="Move to Archived (X or R)"
      >
        <X className="h-3.5 w-3.5" />
        Dismiss
        <kbd className="ml-1 px-1 text-[10px] font-mono bg-white/60 dark:bg-black/20 rounded border border-red-200 dark:border-red-800">
          X
        </kbd>
      </button>
    </div>
  );
}
