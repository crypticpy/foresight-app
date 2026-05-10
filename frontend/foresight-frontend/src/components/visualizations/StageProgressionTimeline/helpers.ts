/**
 * Shared helpers for the StageProgressionTimeline visualization: horizon
 * colour palettes and stage-progression direction indicators.
 *
 * @module components/visualizations/StageProgressionTimeline/helpers
 */

export interface HorizonColors {
  bg: string;
  text: string;
  border: string;
  dot: string;
  line: string;
}

const HORIZON_COLOR_MAP: Record<string, HorizonColors> = {
  H1: {
    bg: "bg-green-50 dark:bg-green-900/30",
    text: "text-green-800 dark:text-green-200",
    border: "border-green-400 dark:border-green-600",
    dot: "bg-green-500 dark:bg-green-400",
    line: "bg-green-300 dark:bg-green-700",
  },
  H2: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-200",
    border: "border-amber-400 dark:border-amber-600",
    dot: "bg-amber-500 dark:bg-amber-400",
    line: "bg-amber-300 dark:bg-amber-700",
  },
  H3: {
    bg: "bg-purple-50 dark:bg-purple-900/30",
    text: "text-purple-800 dark:text-purple-200",
    border: "border-purple-400 dark:border-purple-600",
    dot: "bg-purple-500 dark:bg-purple-400",
    line: "bg-purple-300 dark:bg-purple-700",
  },
};

const FALLBACK_COLORS: HorizonColors = {
  bg: "bg-gray-50 dark:bg-dark-surface",
  text: "text-gray-800 dark:text-gray-200",
  border: "border-gray-400 dark:border-gray-600",
  dot: "bg-gray-500 dark:bg-gray-400",
  line: "bg-gray-300 dark:bg-gray-700",
};

/** Returns the Tailwind class palette for a horizon code (H1/H2/H3). */
export function getHorizonColorClasses(horizonCode: string): HorizonColors {
  return HORIZON_COLOR_MAP[horizonCode] || FALLBACK_COLORS;
}

export interface DirectionIndicator {
  icon: string;
  label: string;
  color: string;
}

/** Returns icon + colour metadata for a stage transition direction. */
export function getDirectionIndicator(
  oldStage: number,
  newStage: number,
): DirectionIndicator {
  if (newStage > oldStage) {
    return {
      icon: "↑",
      label: "Progressed",
      color: "text-green-600 dark:text-green-400",
    };
  }
  if (newStage < oldStage) {
    return {
      icon: "↓",
      label: "Regressed",
      color: "text-red-600 dark:text-red-400",
    };
  }
  return {
    icon: "•",
    label: "No change",
    color: "text-gray-500 dark:text-gray-400",
  };
}
