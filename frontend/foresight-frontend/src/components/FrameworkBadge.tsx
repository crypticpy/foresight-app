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

type FrameworkColors = { bg: string; text: string; border: string };

// Explicit palette for known frameworks. New frameworks not in this map get a
// deterministic color from `FALLBACK_PALETTE` keyed by their code, so they
// stay visually consistent across pages without hard-coding every entry.
const COLOR_MAP: Record<string, FrameworkColors> = {
  PPP: {
    bg: "bg-indigo-50 dark:bg-indigo-900/30",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200 dark:border-indigo-700",
  },
};

const FALLBACK_PALETTE: FrameworkColors[] = [
  {
    bg: "bg-teal-50 dark:bg-teal-900/30",
    text: "text-teal-700 dark:text-teal-300",
    border: "border-teal-200 dark:border-teal-700",
  },
  {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-700",
  },
  {
    bg: "bg-rose-50 dark:bg-rose-900/30",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-700",
  },
  {
    bg: "bg-cyan-50 dark:bg-cyan-900/30",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-200 dark:border-cyan-700",
  },
  {
    bg: "bg-violet-50 dark:bg-violet-900/30",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200 dark:border-violet-700",
  },
];

function pickFallback(code: string): FrameworkColors {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length]!;
}

export function FrameworkBadge({
  code,
  name,
  description,
  size = "sm",
  showIcon = true,
  className,
  disableTooltip = false,
}: FrameworkBadgeProps) {
  const colors = COLOR_MAP[code] ?? pickFallback(code);
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
