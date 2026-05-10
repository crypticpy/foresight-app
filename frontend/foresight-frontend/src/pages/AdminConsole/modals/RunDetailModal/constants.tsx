/**
 * Shared constants + a small badge component for the discovery run detail
 * modal. The processing-status taxonomy mirrors the worker's source
 * lifecycle and is used in the summary table, breakdown panel, and per-row
 * status pill.
 *
 * @module pages/AdminConsole/modals/RunDetailModal/constants
 */

import { cn } from "../../../../lib/utils";

export const RUN_DETAIL_PAGE_SIZE = 25;

export const PROCESSING_STATUS_LABELS: Record<string, string> = {
  discovered: "Discovered",
  triaged: "Triaged",
  analyzed: "Analyzed",
  deduplicated: "Deduplicated",
  card_created: "Card created",
  card_enriched: "Card enriched",
  filtered_triage: "Filtered (triage)",
  filtered_blocked: "Filtered (blocked)",
  filtered_duplicate: "Filtered (duplicate)",
  error: "Error",
  unknown: "Unknown",
};

export const PROCESSING_STATUS_COLORS: Record<string, string> = {
  card_created:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  card_enriched: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  error: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  filtered_triage:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  filtered_blocked:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  filtered_duplicate:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

export function ProcessingStatusBadge({ status }: { status: string }) {
  const label = PROCESSING_STATUS_LABELS[status] || status;
  const color =
    PROCESSING_STATUS_COLORS[status] ||
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        color,
      )}
    >
      {label}
    </span>
  );
}
