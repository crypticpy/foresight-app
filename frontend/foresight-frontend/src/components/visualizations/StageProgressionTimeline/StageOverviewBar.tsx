/**
 * Horizontal bar that shows all 8 maturity stages with their horizon
 * colours, highlighting the ones a card has occupied and ringing the
 * current stage.
 *
 * @module components/visualizations/StageProgressionTimeline/StageOverviewBar
 */

import { cn } from "../../../lib/utils";
import { getStageByNumber } from "../../../data/taxonomy";
import { Tooltip } from "../../ui/Tooltip";

import { getHorizonColorClasses } from "./helpers";

export interface StageOverviewBarProps {
  currentStage?: number;
  highlightedStages?: number[];
}

const STAGE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function StageOverviewBar({
  currentStage,
  highlightedStages = [],
}: StageOverviewBarProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 mb-1">
        <span>Concept</span>
        <span>Mature</span>
      </div>
      <div className="flex items-center gap-0.5">
        {STAGE_NUMBERS.map((stage) => {
          const stageData = getStageByNumber(stage);
          const horizon = stageData?.horizon || "H1";
          const colors = getHorizonColorClasses(horizon);
          const isHighlighted = highlightedStages.includes(stage);
          const isCurrent = stage === currentStage;

          return (
            <Tooltip
              key={stage}
              content={
                stageData
                  ? `${stage}. ${stageData.name} (${horizon})`
                  : `Stage ${stage}`
              }
              side="top"
            >
              <div
                className={cn(
                  "flex-1 h-2 transition-all duration-200 cursor-pointer",
                  stage === 1 && "rounded-l-full",
                  stage === 8 && "rounded-r-full",
                  isHighlighted || (currentStage && stage <= currentStage)
                    ? colors.dot
                    : "bg-gray-200 dark:bg-gray-700",
                  isCurrent &&
                    "ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500",
                )}
              />
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
