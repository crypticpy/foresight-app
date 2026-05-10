/**
 * Shared types, constants, and color helpers for the analytics filter
 * panel. Imported by the composer (`AnalyticsFilters.tsx`) and by every
 * dropdown sub-component in this directory.
 *
 * @module components/analytics/AnalyticsFilters/types
 */

import {
  Briefcase,
  Building2,
  Car,
  Heart,
  Home,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { format, startOfMonth, subDays, subMonths } from "date-fns";

export interface AnalyticsFiltersState {
  /** Selected pillar codes (e.g., ['CH', 'MC']) */
  selectedPillars: string[];
  /** Selected stage numbers (e.g., [1, 2, 3]) */
  selectedStages: number[];
  /** Time range preset or 'custom' */
  timeRange: TimeRangePreset;
  /** Custom date range (only used when timeRange is 'custom') */
  customDateRange: {
    start: string | null;
    end: string | null;
  };
}

export type TimeRangePreset =
  | "7d"
  | "30d"
  | "90d"
  | "6m"
  | "1y"
  | "mtd"
  | "ytd"
  | "all"
  | "custom";

export const TIME_RANGE_OPTIONS: {
  value: TimeRangePreset;
  label: string;
  shortLabel: string;
}[] = [
  { value: "7d", label: "Last 7 days", shortLabel: "7D" },
  { value: "30d", label: "Last 30 days", shortLabel: "30D" },
  { value: "90d", label: "Last 90 days", shortLabel: "90D" },
  { value: "6m", label: "Last 6 months", shortLabel: "6M" },
  { value: "1y", label: "Last year", shortLabel: "1Y" },
  { value: "mtd", label: "Month to date", shortLabel: "MTD" },
  { value: "ytd", label: "Year to date", shortLabel: "YTD" },
  { value: "all", label: "All time", shortLabel: "All" },
  { value: "custom", label: "Custom range", shortLabel: "Custom" },
];

export const PILLAR_ICONS: Record<string, LucideIcon> = {
  Heart,
  Briefcase,
  Building2,
  Home,
  Car,
  Shield,
};

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFiltersState = {
  selectedPillars: [],
  selectedStages: [],
  timeRange: "30d",
  customDateRange: { start: null, end: null },
};

/**
 * Resolves a time-range preset to a concrete `{start, end}` date pair.
 * Returns null for `all` and `custom` — the caller handles those cases.
 */
export function getDateRangeFromPreset(
  preset: TimeRangePreset,
): { start: string; end: string } | null {
  const now = new Date();
  const endDate = format(now, "yyyy-MM-dd");

  switch (preset) {
    case "7d":
      return { start: format(subDays(now, 7), "yyyy-MM-dd"), end: endDate };
    case "30d":
      return { start: format(subDays(now, 30), "yyyy-MM-dd"), end: endDate };
    case "90d":
      return { start: format(subDays(now, 90), "yyyy-MM-dd"), end: endDate };
    case "6m":
      return { start: format(subMonths(now, 6), "yyyy-MM-dd"), end: endDate };
    case "1y":
      return { start: format(subMonths(now, 12), "yyyy-MM-dd"), end: endDate };
    case "mtd":
      return {
        start: format(startOfMonth(now), "yyyy-MM-dd"),
        end: endDate,
      };
    case "ytd":
      return {
        start: format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd"),
        end: endDate,
      };
    case "all":
    case "custom":
      return null;
    default:
      return null;
  }
}

/** Pillar-code → Tailwind color classes for backgrounds, text, and borders. */
export function getPillarColorClasses(pillarCode: string): {
  bg: string;
  text: string;
  border: string;
} {
  const colorMap: Record<string, { bg: string; text: string; border: string }> =
    {
      CH: {
        bg: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-800 dark:text-green-200",
        border: "border-green-400",
      },
      EW: {
        bg: "bg-blue-100 dark:bg-blue-900/30",
        text: "text-blue-800 dark:text-blue-200",
        border: "border-blue-400",
      },
      HG: {
        bg: "bg-indigo-100 dark:bg-indigo-900/30",
        text: "text-indigo-800 dark:text-indigo-200",
        border: "border-indigo-400",
      },
      HH: {
        bg: "bg-pink-100 dark:bg-pink-900/30",
        text: "text-pink-800 dark:text-pink-200",
        border: "border-pink-400",
      },
      MC: {
        bg: "bg-amber-100 dark:bg-amber-900/30",
        text: "text-amber-800 dark:text-amber-200",
        border: "border-amber-400",
      },
      PS: {
        bg: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-800 dark:text-red-200",
        border: "border-red-400",
      },
    };
  return (
    colorMap[pillarCode] || {
      bg: "bg-gray-100",
      text: "text-gray-800",
      border: "border-gray-400",
    }
  );
}

/** Horizon-code → Tailwind color classes for background + text. */
export function getHorizonColorClasses(horizonCode: string): {
  bg: string;
  text: string;
} {
  const colorMap: Record<string, { bg: string; text: string }> = {
    H1: {
      bg: "bg-green-100 dark:bg-green-900/30",
      text: "text-green-800 dark:text-green-200",
    },
    H2: {
      bg: "bg-amber-100 dark:bg-amber-900/30",
      text: "text-amber-800 dark:text-amber-200",
    },
    H3: {
      bg: "bg-purple-100 dark:bg-purple-900/30",
      text: "text-purple-800 dark:text-purple-200",
    },
  };
  return colorMap[horizonCode] || { bg: "bg-gray-100", text: "text-gray-800" };
}
