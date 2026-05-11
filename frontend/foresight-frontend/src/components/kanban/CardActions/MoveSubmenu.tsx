/**
 * Submenu that lists every kanban column as a destination for the
 * "Move to..." action. The currently-occupied column is disabled.
 *
 * @module components/kanban/CardActions/MoveSubmenu
 */

import { memo } from "react";
import { cn } from "../../../lib/utils";
import { KANBAN_COLUMNS, type KanbanStatus } from "../types";

export interface MoveSubmenuProps {
  currentStatus: KanbanStatus;
  onMove: (status: KanbanStatus) => void;
}

export const MoveSubmenu = memo(function MoveSubmenu({
  currentStatus,
  onMove,
}: MoveSubmenuProps) {
  return (
    <div className="py-1">
      {KANBAN_COLUMNS.map((column) => {
        const isCurrentColumn = column.id === currentStatus;

        return (
          <button
            key={column.id}
            onClick={() => {
              if (!isCurrentColumn) {
                onMove(column.id);
              }
            }}
            disabled={isCurrentColumn}
            className={cn(
              "w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors",
              isCurrentColumn
                ? "text-gray-400 dark:text-gray-500 cursor-not-allowed bg-gray-50 dark:bg-dark-surface/50"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700",
            )}
          >
            <span className="flex-1">{column.title}</span>
            {isCurrentColumn && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                (current)
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
