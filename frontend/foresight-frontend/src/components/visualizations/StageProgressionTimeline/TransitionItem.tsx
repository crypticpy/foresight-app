/**
 * Single transition entry in the stage-progression timeline. Renders a
 * compact horizontal row or a full vertical timeline row depending on
 * the `compact` flag.
 *
 * @module components/visualizations/StageProgressionTimeline/TransitionItem
 */

import { format } from "date-fns";

import { cn } from "../../../lib/utils";
import { getStageByNumber } from "../../../data/taxonomy";
import type { StageHistory } from "../../../lib/discovery-api";

import { getDirectionIndicator, getHorizonColorClasses } from "./helpers";
import { StageNode } from "./StageNode";
import { TransitionArrow } from "./TransitionArrow";

export interface TransitionItemProps {
  transition: StageHistory;
  isFirst: boolean;
  isLast: boolean;
  compact?: boolean;
}

export function TransitionItem({
  transition,
  isFirst,
  isLast,
  compact = false,
}: TransitionItemProps) {
  // First-record entries have a null old stage/horizon; fall back to the
  // new values so the indicator renders as "no change" instead of NaN.
  const oldStageId = transition.old_stage_id ?? transition.new_stage_id;
  const oldHorizon = transition.old_horizon ?? transition.new_horizon;

  const oldStageData = getStageByNumber(oldStageId);
  const newStageData = getStageByNumber(transition.new_stage_id);
  const direction = getDirectionIndicator(oldStageId, transition.new_stage_id);
  const newColors = getHorizonColorClasses(transition.new_horizon);

  const formattedDate = format(new Date(transition.changed_at), "MMM d, yyyy");
  const formattedTime = format(new Date(transition.changed_at), "h:mm a");

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <StageNode stage={oldStageId} horizonCode={oldHorizon} size="sm" />
        <TransitionArrow
          oldStage={oldStageId}
          newStage={transition.new_stage_id}
          compact
        />
        <StageNode
          stage={transition.new_stage_id}
          horizonCode={transition.new_horizon}
          size="sm"
          isActive={isFirst}
        />
        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
          {formattedDate}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex items-start gap-4">
      {!isLast && (
        <div
          className={cn(
            "absolute left-4 top-10 w-0.5 h-full -ml-px",
            newColors.line,
          )}
          aria-hidden="true"
        />
      )}

      <div className="relative flex-shrink-0">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center",
            newColors.dot,
          )}
        >
          <span className="text-white font-bold text-sm">{direction.icon}</span>
        </div>
      </div>

      <div className="flex-1 min-w-0 pb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <StageNode stage={oldStageId} horizonCode={oldHorizon} />
            <span className={cn("text-xl", direction.color)}>→</span>
            <StageNode
              stage={transition.new_stage_id}
              horizonCode={transition.new_horizon}
              isActive={isFirst}
            />
          </div>

          <div className="text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              {oldStageData?.name || `Stage ${oldStageId}`}
            </span>
            <span className="mx-2 text-gray-400">→</span>
            <span className={cn("font-medium", newColors.text)}>
              {newStageData?.name || `Stage ${transition.new_stage_id}`}
            </span>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <time dateTime={transition.changed_at}>
            {formattedDate} at {formattedTime}
          </time>
          {transition.trigger && (
            <span className="flex items-center gap-1">
              <span className="text-gray-400">•</span>
              <span className="capitalize">{transition.trigger}</span>
            </span>
          )}
        </div>

        {transition.old_horizon !== transition.new_horizon && (
          <div className="mt-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                newColors.bg,
                newColors.text,
              )}
            >
              Horizon: {transition.old_horizon ?? "—"} →{" "}
              {transition.new_horizon}
            </span>
          </div>
        )}

        {transition.reason && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 italic">
            "{transition.reason}"
          </p>
        )}
      </div>
    </div>
  );
}
