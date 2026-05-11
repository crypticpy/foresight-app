/**
 * Placeholder rendered when a card has no recorded stage transitions —
 * either shows the current stage badge or a generic "no transitions"
 * empty state.
 *
 * @module components/visualizations/StageProgressionTimeline/EmptyState
 */

import { getStageByNumber } from "../../../data/taxonomy";

import { StageNode } from "./StageNode";

export interface EmptyStateProps {
  currentStage?: number;
}

export function EmptyState({ currentStage }: EmptyStateProps) {
  const stageData = currentStage ? getStageByNumber(currentStage) : null;
  const horizon = stageData?.horizon || "H1";

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      {currentStage && stageData ? (
        <>
          <StageNode stage={currentStage} horizonCode={horizon} isActive />
          <p className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            {stageData.name}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Current stage - no transitions recorded yet
          </p>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-dark-surface flex items-center justify-center">
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            No stage transitions recorded
          </p>
        </>
      )}
    </div>
  );
}
