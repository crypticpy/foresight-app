/**
 * Round numeric badge for a maturity stage (1-8) with horizon-tinted
 * colours and a tooltip describing the stage.
 *
 * @module components/visualizations/StageProgressionTimeline/StageNode
 */

import { cn } from "../../../lib/utils";
import { getStageByNumber } from "../../../data/taxonomy";
import { Tooltip } from "../../ui/Tooltip";

import { getHorizonColorClasses } from "./helpers";

export interface StageNodeProps {
  stage: number;
  horizonCode: string;
  isActive?: boolean;
  size?: "sm" | "md";
}

export function StageNode({
  stage,
  horizonCode,
  isActive = false,
  size = "md",
}: StageNodeProps) {
  const stageData = getStageByNumber(stage);
  const colors = getHorizonColorClasses(horizonCode);
  const sizeClasses = size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm";

  return (
    <Tooltip
      content={
        stageData ? (
          <div className="text-sm">
            <div className="font-semibold">{stageData.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Stage {stage} - {horizonCode}
            </div>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              {stageData.description}
            </p>
          </div>
        ) : (
          `Stage ${stage}`
        )
      }
      side="top"
    >
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-bold border-2 transition-all duration-200 cursor-pointer",
          sizeClasses,
          colors.bg,
          colors.text,
          colors.border,
          isActive && "ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-600",
        )}
        role="status"
        aria-label={
          stageData ? `Stage ${stage}: ${stageData.name}` : `Stage ${stage}`
        }
      >
        {stage}
      </div>
    </Tooltip>
  );
}
