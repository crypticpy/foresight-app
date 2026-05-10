/**
 * Three side-by-side panels for a run: processing-status distribution,
 * triage pass/fail/pending, and errors grouped by stage. Each panel
 * sorts by descending count so the most frequent outcomes float to the top.
 *
 * @module pages/AdminConsole/modals/RunDetailModal/RunStageBreakdown
 */

import { type AdminRunDetailResponse } from "../../../../lib/admin-api";
import { ProcessingStatusBadge } from "./constants";

export function RunStageBreakdown({
  totals,
}: {
  totals: AdminRunDetailResponse["totals"];
}) {
  const statusEntries = Object.entries(totals.by_processing_status).sort(
    ([, a], [, b]) => b - a,
  );
  const errorEntries = Object.entries(totals.by_error_stage).sort(
    ([, a], [, b]) => b - a,
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface-elevated">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
          Processing status
        </h3>
        {statusEntries.length === 0 ? (
          <div className="text-sm text-gray-500">No sources persisted.</div>
        ) : (
          <ul className="space-y-1.5">
            {statusEntries.map(([key, count]) => (
              <li
                key={key}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <ProcessingStatusBadge status={key} />
                <span className="font-mono text-gray-700 dark:text-gray-300">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface-elevated">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
          Triage outcome
        </h3>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-emerald-700 dark:text-emerald-400">
              Passed
            </span>
            <span className="font-mono">{totals.by_triage.passed}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-amber-700 dark:text-amber-400">Filtered</span>
            <span className="font-mono">{totals.by_triage.failed}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-gray-500">Pending / not triaged</span>
            <span className="font-mono">{totals.by_triage.pending}</span>
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface-elevated">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
          Errors by stage
        </h3>
        {errorEntries.length === 0 ? (
          <div className="text-sm text-gray-500">None.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {errorEntries.map(([stage, count]) => (
              <li
                key={stage}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-rose-700 dark:text-rose-400">
                  {stage}
                </span>
                <span className="font-mono">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
