/**
 * StageProgressionTimeline composer — wires the overview bar, transition
 * rows, and summary footer for a card's stage history. Supports both a
 * compact horizontal view and a vertical timeline view.
 *
 * @module components/visualizations/StageProgressionTimeline
 */

import React from "react";
import { format } from "date-fns";

import { cn } from "../../../lib/utils";
import type { StageHistory } from "../../../lib/discovery-api";

import { EmptyState } from "./EmptyState";
import { StageOverviewBar } from "./StageOverviewBar";
import { TransitionItem } from "./TransitionItem";

export interface StageProgressionTimelineProps {
  /** Array of stage transitions (ordered newest to oldest) */
  stageHistory: StageHistory[];
  /** Current stage if no history exists */
  currentStage?: number;
  /** Additional className */
  className?: string;
  /** Whether to show compact view */
  compact?: boolean;
}

export function StageProgressionTimeline({
  stageHistory,
  currentStage,
  className,
  compact = false,
}: StageProgressionTimelineProps) {
  const highlightedStages = React.useMemo(() => {
    const stages = new Set<number>();
    stageHistory.forEach((t) => {
      if (t.old_stage_id !== null) stages.add(t.old_stage_id);
      stages.add(t.new_stage_id);
    });
    if (currentStage) stages.add(currentStage);
    return Array.from(stages);
  }, [stageHistory, currentStage]);

  const newestTransition = stageHistory[0];
  const oldestTransition = stageHistory[stageHistory.length - 1];
  const effectiveCurrentStage = currentStage ?? newestTransition?.new_stage_id;

  if (stageHistory.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-gray-200 dark:border-gray-700",
          className,
        )}
      >
        <div className="px-4 pt-4">
          <StageOverviewBar
            currentStage={effectiveCurrentStage}
            highlightedStages={
              effectiveCurrentStage ? [effectiveCurrentStage] : []
            }
          />
        </div>
        <EmptyState currentStage={effectiveCurrentStage} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 dark:border-gray-700",
        className,
      )}
    >
      <div className="px-4 pt-4">
        <StageOverviewBar
          currentStage={effectiveCurrentStage}
          highlightedStages={highlightedStages}
        />
      </div>

      <div className={cn("p-4", compact ? "space-y-2" : "")}>
        {compact ? (
          <div className="flex flex-wrap gap-3">
            {stageHistory.map((transition, index) => (
              <TransitionItem
                key={transition.id}
                transition={transition}
                isFirst={index === 0}
                isLast={index === stageHistory.length - 1}
                compact
              />
            ))}
          </div>
        ) : (
          <div className="relative">
            {stageHistory.map((transition, index) => (
              <TransitionItem
                key={transition.id}
                transition={transition}
                isFirst={index === 0}
                isLast={index === stageHistory.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      {oldestTransition && !compact && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {stageHistory.length} transition
              {stageHistory.length !== 1 ? "s" : ""} recorded
            </span>
            <span>
              First recorded:{" "}
              {format(new Date(oldestTransition.changed_at), "MMM d, yyyy")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default StageProgressionTimeline;
