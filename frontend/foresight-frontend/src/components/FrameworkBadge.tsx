/**
 * FrameworkBadge — strategic-framework code badge.
 *
 * Renders a compact code (e.g. "PPP") with brand colour and an optional
 * tooltip showing the full framework name and description.  Designed to
 * sit alongside the existing badge family (PillarBadge, HorizonBadge…)
 * so it inherits the shared sizing and tooltip primitives.
 */

import { Compass } from "lucide-react";
import { cn } from "../lib/utils";
import {
  getSizeClasses,
  getIconSize,
  getBadgeBaseClasses,
  BadgeTooltipWrapper,
  type BadgeSize,
} from "../lib/badge-utils";

export interface FrameworkBadgeProps {
  code: string;
  name?: string | null;
  description?: string | null;
  size?: BadgeSize;
  showIcon?: boolean;
  className?: string;
  disableTooltip?: boolean;
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> =
  {
    PPP: {
      bg: "bg-indigo-50 dark:bg-indigo-900/30",
      text: "text-indigo-700 dark:text-indigo-300",
      border: "border-indigo-200 dark:border-indigo-700",
    },
  };

const FALLBACK_COLORS = {
  bg: "bg-gray-100 dark:bg-dark-surface",
  text: "text-gray-700 dark:text-gray-300",
  border: "border-gray-300 dark:border-gray-700",
};

export function FrameworkBadge({
  code,
  name,
  description,
  size = "sm",
  showIcon = true,
  className,
  disableTooltip = false,
}: FrameworkBadgeProps) {
  const colors = COLOR_MAP[code] ?? FALLBACK_COLORS;
  const iconSize = getIconSize(size);

  const badge = (
    <span
      className={cn(
        getBadgeBaseClasses({ hasTooltip: !disableTooltip }),
        getSizeClasses(size, { includeGap: showIcon }),
        colors.bg,
        colors.text,
        colors.border,
        className,
      )}
      role="status"
      aria-label={name ? `${name} framework` : `${code} framework`}
    >
      {showIcon && <Compass className="shrink-0" size={iconSize} />}
      <span className="font-mono">{code}</span>
    </span>
  );

  return (
    <BadgeTooltipWrapper
      disabled={disableTooltip || (!name && !description)}
      content={
        <div className="space-y-1.5 max-w-[280px]">
          {name && (
            <div className="font-semibold text-gray-900 dark:text-gray-100">
              {name}
            </div>
          )}
          {description && (
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      }
    >
      {badge}
    </BadgeTooltipWrapper>
  );
}

export default FrameworkBadge;
