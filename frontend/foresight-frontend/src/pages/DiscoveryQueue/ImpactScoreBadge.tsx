/**
 * Impact-score chip + hover tooltip. Drives the small ⚡<score> indicator next
 * to each pending card and the tooltip that explains the strategic-impact
 * tier on hover.
 *
 * @module pages/DiscoveryQueue/ImpactScoreBadge
 */

import { Zap } from "lucide-react";
import { Tooltip } from "../../components/ui/Tooltip";
import { cn } from "../../lib/utils";
import { getImpactLevel } from "./utils";

const PROGRESS_BAR_CLASSES: Record<"high" | "medium" | "low", string> = {
  high: "bg-purple-500 dark:bg-purple-400",
  medium: "bg-indigo-500 dark:bg-indigo-400",
  low: "bg-slate-500 dark:bg-slate-400",
};

function ImpactScoreTooltipContent({ score }: { score: number }) {
  const impactInfo = getImpactLevel(score);

  return (
    <div className="space-y-3 min-w-[200px] max-w-[260px]">
      <div className="flex items-center gap-2">
        <div className={cn("p-1.5 rounded-md", impactInfo.bgColor)}>
          <Zap className={cn("h-4 w-4", impactInfo.color)} />
        </div>
        <div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {impactInfo.label}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Impact Score: {score}/100
          </div>
        </div>
      </div>

      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
        {impactInfo.description}
      </p>

      <div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-200",
              PROGRESS_BAR_CLASSES[impactInfo.level],
            )}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export interface ImpactScoreBadgeProps {
  score: number;
  size?: "sm" | "md";
}

export function ImpactScoreBadge({
  score,
  size = "sm",
}: ImpactScoreBadgeProps) {
  const impactInfo = getImpactLevel(score);

  const sizeClasses =
    size === "sm" ? "px-1.5 py-0.5 text-xs gap-1" : "px-2 py-1 text-sm gap-1.5";
  const iconSize = size === "sm" ? 10 : 12;

  return (
    <Tooltip
      content={<ImpactScoreTooltipContent score={score} />}
      side="top"
      align="center"
      contentClassName="p-3"
    >
      <span
        className={cn(
          "inline-flex items-center rounded-full font-medium border cursor-pointer",
          impactInfo.bgColor,
          impactInfo.color,
          impactInfo.borderColor,
          sizeClasses,
        )}
        role="status"
        aria-label={`${impactInfo.label}: ${score}/100`}
      >
        <Zap className="shrink-0" size={iconSize} />
        <span>{score}</span>
      </span>
    </Tooltip>
  );
}
