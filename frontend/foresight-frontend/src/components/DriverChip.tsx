/**
 * DriverChip — display a single PPP driver as a chip.
 *
 * Hovering surfaces the driver's description plus the curated list of
 * tracked-metric examples (display-ready strings; not search topics).
 */

import { Target } from "lucide-react";
import { cn } from "../lib/utils";
import {
  getSizeClasses,
  getIconSize,
  getBadgeBaseClasses,
  BadgeTooltipWrapper,
  type BadgeSize,
} from "../lib/badge-utils";

export interface DriverChipProps {
  name: string;
  description?: string | null;
  trackedMetricExamples?: string[];
  selected?: boolean;
  size?: BadgeSize;
  showIcon?: boolean;
  className?: string;
  disableTooltip?: boolean;
  onClick?: () => void;
}

export function DriverChip({
  name,
  description,
  trackedMetricExamples,
  selected = false,
  size = "sm",
  showIcon = false,
  className,
  disableTooltip = false,
  onClick,
}: DriverChipProps) {
  const iconSize = getIconSize(size);

  const chip = (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        getBadgeBaseClasses({ pill: true, hasTooltip: !disableTooltip }),
        getSizeClasses(size, { includeGap: showIcon, variant: "pill" }),
        selected
          ? "bg-brand-blue text-white border-brand-blue"
          : "bg-gray-100 text-gray-700 border-gray-300 dark:bg-dark-surface dark:text-gray-200 dark:border-gray-700",
        onClick && !selected && "hover:border-brand-blue hover:text-brand-blue",
        onClick && selected && "hover:bg-brand-blue/90",
        !onClick && "cursor-default",
        "transition-colors duration-200",
        className,
      )}
      aria-pressed={onClick ? selected : undefined}
      aria-label={`Driver: ${name}`}
    >
      {showIcon && <Target className="shrink-0" size={iconSize} />}
      <span>{name}</span>
    </button>
  );

  const hasContent =
    description || (trackedMetricExamples && trackedMetricExamples.length > 0);

  return (
    <BadgeTooltipWrapper
      disabled={disableTooltip || !hasContent}
      content={
        <div className="space-y-2 max-w-[300px]">
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {name}
          </div>
          {description && (
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              {description}
            </p>
          )}
          {trackedMetricExamples && trackedMetricExamples.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Tracked metrics
              </div>
              <ul className="space-y-0.5">
                {trackedMetricExamples.map((m) => (
                  <li
                    key={m}
                    className="text-xs text-gray-700 dark:text-gray-300 leading-snug"
                  >
                    • {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      }
    >
      {chip}
    </BadgeTooltipWrapper>
  );
}

export default DriverChip;
