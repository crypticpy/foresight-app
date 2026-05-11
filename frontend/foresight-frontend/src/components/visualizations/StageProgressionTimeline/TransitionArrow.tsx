/**
 * Arrow rendered between two `StageNode`s indicating progression,
 * regression, or no-change for a single stage transition.
 *
 * @module components/visualizations/StageProgressionTimeline/TransitionArrow
 */

import { cn } from "../../../lib/utils";

import { getDirectionIndicator } from "./helpers";

export interface TransitionArrowProps {
  oldStage: number;
  newStage: number;
  compact?: boolean;
}

export function TransitionArrow({
  oldStage,
  newStage,
  compact = false,
}: TransitionArrowProps) {
  const direction = getDirectionIndicator(oldStage, newStage);

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        compact ? "px-1" : "px-2",
      )}
    >
      <span
        className={cn(
          "font-bold",
          compact ? "text-base" : "text-lg",
          direction.color,
        )}
        aria-label={direction.label}
      >
        {compact ? "→" : `${direction.icon} →`}
      </span>
    </div>
  );
}
