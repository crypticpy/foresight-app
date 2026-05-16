/**
 * Pure helpers and presentational data-shaping for `KanbanCard`. Kept
 * dependency-free so the composer doesn't have to wade through tailwind
 * mapping logic.
 *
 * @module components/kanban/KanbanCard/helpers
 */

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
