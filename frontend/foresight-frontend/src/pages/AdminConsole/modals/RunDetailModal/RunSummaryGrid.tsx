/**
 * Summary grid for the run detail modal — high-level facts about the run
 * (when, who, what was scanned, cost, totals) and an inline error / truncation
 * notice when applicable.
 *
 * @module pages/AdminConsole/modals/RunDetailModal/RunSummaryGrid
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

import { type AdminRunDetailResponse } from "../../../../lib/admin-api";
import { formatDate } from "../../helpers";

export function RunSummaryGrid({
  run,
  totals,
}: {
  run: AdminRunDetailResponse["run"];
  totals: AdminRunDetailResponse["totals"];
}) {
  const entries: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Triggered by", value: run.triggered_by || "scheduled" },
    { label: "Started", value: formatDate(run.started_at) },
    { label: "Completed", value: formatDate(run.completed_at) },
    {
      label: "Pillars scanned",
      value: (run.pillars_scanned || []).join(", ") || "—",
    },
    { label: "Queries generated", value: run.queries_generated ?? 0 },
    { label: "Sources found", value: run.sources_found ?? 0 },
    {
      label: "Sources stored",
      value: totals.sources_total,
    },
    {
      label: "Cards created / enriched",
      value: `${totals.card_outcomes.card_created} / ${totals.card_outcomes.card_enriched}`,
    },
    {
      label: "Estimated cost",
      value:
        run.estimated_cost != null
          ? `$${Number(run.estimated_cost).toFixed(4)}`
          : "—",
    },
  ];
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface-elevated">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
        Summary
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <div
            key={entry.label}
            className="flex items-baseline justify-between"
          >
            <dt className="text-gray-500 dark:text-gray-400">{entry.label}</dt>
            <dd className="font-medium text-gray-900 dark:text-white">
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
      {run.error_message && (
        <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <div className="font-medium">Run error</div>
          <div>{run.error_message}</div>
        </div>
      )}
      {totals.aggregate_truncated && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Aggregate counts truncated — run produced more sources than the
          per-page cap.
        </div>
      )}
    </div>
  );
}
