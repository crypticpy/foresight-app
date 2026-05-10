/**
 * City-of-Austin palette plus export-progress tuning knobs shared across
 * the BulkExportModal sub-modules.
 *
 * @module components/BulkExportModal/constants
 */

export const COA_COLORS = {
  logoBlue: "#44499C",
  logoGreen: "#009F4D",
  fadedWhite: "#f7f6f5",
  darkBlue: "#22254E",
  lightBlue: "#dcf2fd",
  lightGreen: "#dff0e3",
  red: "#F83125",
  darkGray: "#636262",
  amber: "#F59E0B",
} as const;

// Estimated time per card for AI synthesis + generation.
export const ESTIMATED_SECONDS_PER_CARD = 8;
// Threshold past which we surface a "taking longer than expected" warning.
export const LONG_EXPORT_WARNING_THRESHOLD = 60;

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return `${secs}s`;
}
