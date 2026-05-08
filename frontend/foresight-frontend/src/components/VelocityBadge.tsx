/**
 * VelocityBadge Component
 *
 * Displays a signal velocity trend indicator with:
 * - Color-coded pill based on trend direction
 * - Contextual icon (TrendingUp, TrendingDown, Sparkles, etc.)
 * - Qualitative tooltip describing what the trend means
 * - Dark mode support
 *
 * The tooltip is intentionally qualitative (not the raw 0–100 velocity
 * score), because phrasing like "+80% velocity" on a "stable" pill reads
 * as a contradiction. The numeric score is already surfaced in the
 * card's score grid; the badge's job is direction, not magnitude.
 *
 * Matches the visual weight and patterns of HorizonBadge and StageBadge.
 */

import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Sparkles,
  Clock,
} from "lucide-react";
import { Tooltip } from "./ui/Tooltip";
import { cn } from "../lib/utils";

// =============================================================================
// Types
// =============================================================================

export type VelocityTrend =
  | "accelerating"
  | "stable"
  | "decelerating"
  | "emerging"
  | "stale";

export interface VelocityBadgeProps {
  /** The velocity trend classification */
  trend: VelocityTrend | null | undefined;
  /**
   * Numeric velocity score (0–100). Accepted for backward compatibility with
   * callers but no longer rendered — surfaced separately in score grids.
   */
  score?: number;
  /** Additional className */
  className?: string;
  /** Whether to show the text label (default: true) */
  showLabel?: boolean;
}

// =============================================================================
// Configuration
// =============================================================================

interface TrendConfig {
  label: string;
  tooltip: string;
  icon: typeof TrendingUp;
  colors: {
    bg: string;
    text: string;
    border: string;
  };
}

const TREND_CONFIG: Record<VelocityTrend, TrendConfig> = {
  accelerating: {
    label: "Accelerating",
    tooltip: "Coverage and momentum are picking up across sources",
    icon: TrendingUp,
    colors: {
      bg: "bg-green-50 dark:bg-green-900/20",
      text: "text-green-600 dark:text-green-400",
      border: "border-green-200 dark:border-green-800",
    },
  },
  stable: {
    label: "Stable",
    tooltip: "Steady coverage; no major shifts in momentum",
    icon: ArrowRight,
    colors: {
      bg: "bg-gray-100 dark:bg-gray-800/40",
      text: "text-gray-500 dark:text-gray-400",
      border: "border-gray-200 dark:border-gray-700",
    },
  },
  decelerating: {
    label: "Slowing",
    tooltip: "Coverage is winding down; fewer fresh sources lately",
    icon: TrendingDown,
    colors: {
      bg: "bg-amber-50 dark:bg-amber-900/20",
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-800",
    },
  },
  emerging: {
    label: "Emerging",
    tooltip: "Newly surfaced signal — too early to tell direction",
    icon: Sparkles,
    colors: {
      bg: "bg-brand-blue/10 dark:bg-brand-blue/20",
      text: "text-brand-blue dark:text-blue-400",
      border: "border-brand-blue/20 dark:border-blue-800",
    },
  },
  stale: {
    label: "Stale",
    tooltip: "No recent activity — sources have gone quiet",
    icon: Clock,
    colors: {
      bg: "bg-gray-100 dark:bg-gray-800/40",
      text: "text-gray-400 dark:text-gray-500",
      border: "border-gray-200 dark:border-gray-700",
    },
  },
};

// =============================================================================
// Component
// =============================================================================

export function VelocityBadge({
  trend,
  className,
  showLabel = true,
}: VelocityBadgeProps) {
  // Don't render anything for null/undefined trends
  if (!trend) {
    return null;
  }

  const config = TREND_CONFIG[trend];
  if (!config) {
    return null;
  }

  const Icon = config.icon;
  const tooltipText = config.tooltip;

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
        "cursor-default transition-colors",
        config.colors.bg,
        config.colors.text,
        config.colors.border,
        className,
      )}
      role="status"
      aria-label={`Velocity: ${config.label}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {showLabel && <span>{config.label}</span>}
    </span>
  );

  return (
    <Tooltip content={tooltipText} side="top" align="center">
      {badge}
    </Tooltip>
  );
}

export default VelocityBadge;
