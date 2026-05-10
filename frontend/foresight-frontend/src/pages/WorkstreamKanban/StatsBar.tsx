/**
 * Counts pill row above the kanban board: Total Signals + per-column
 * counts. Reads from `KANBAN_COLUMNS` so it stays in sync with the board
 * itself.
 *
 * @module pages/WorkstreamKanban/StatsBar
 */

import {
  KANBAN_COLUMNS,
  type KanbanStatus,
  type WorkstreamCard,
} from "../../components/kanban";

interface StatsBarProps {
  cards: Record<KanbanStatus, WorkstreamCard[]>;
}

export function StatsBar({ cards }: StatsBarProps) {
  const totalCards = Object.values(cards).reduce(
    (sum, columnCards) => sum + columnCards.length,
    0,
  );

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Total Signals:
          </span>
          <span className="text-lg font-bold text-brand-blue">
            {totalCards}
          </span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {KANBAN_COLUMNS.map((column) => {
            const count = cards[column.id]?.length || 0;
            return (
              <div
                key={column.id}
                className="flex items-center gap-1.5 text-sm"
                title={column.description}
              >
                <span className="text-gray-600 dark:text-gray-400">
                  {column.title}:
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
