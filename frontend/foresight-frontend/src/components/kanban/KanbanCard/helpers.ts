/**
 * Pure helpers and presentational data-shaping for `KanbanCard`. Kept
 * dependency-free so the composer doesn't have to wade through tailwind
 * mapping logic.
 *
 * @module components/kanban/KanbanCard/helpers
 */

import type { WorkstreamCard } from "../types";

/**
 * Color class for the card's left border accent, keyed by horizon.
 */
export function getAccentBorderClass(horizon: "H1" | "H2" | "H3"): string {
  const accentMap: Record<string, string> = {
    H1: "border-l-green-500",
    H2: "border-l-amber-500",
    H3: "border-l-purple-500",
  };
  return accentMap[horizon] || "border-l-gray-400";
}

/**
 * Stage IDs come as either `1` or `"1_concept"`. Pull the numeric prefix.
 */
export function parseStageNumber(stageId: number | string): number | null {
  if (typeof stageId === "number") return stageId;
  const match = String(stageId).match(/^(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

export interface BriefChip {
  label: string;
  className: string;
}

/**
 * Brief-status chip descriptor, or null when the card has no brief artifact.
 */
export function getBriefChip(
  briefStatus: WorkstreamCard["brief_status"],
): BriefChip | null {
  switch (briefStatus) {
    case "draft":
      return {
        label: "Draft brief",
        className:
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
      };
    case "ready":
      return {
        label: "Brief ready",
        className:
          "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
      };
    case "exported":
      return {
        label: "Brief exported",
        className:
          "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
      };
    default:
      return null;
  }
}
