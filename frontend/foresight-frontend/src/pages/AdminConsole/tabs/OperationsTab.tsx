/**
 * Operations tab — trigger controlled background jobs (scan, velocity,
 * quality, lens backfill) and inspect recent task state. Discovery run
 * rows are click-throughs into the RunDetailModal.
 *
 * @module pages/AdminConsole/tabs/OperationsTab
 */

import { Play, Telescope } from "lucide-react";

import { type RecentJobsResponse } from "../../../lib/admin-api";
import { cn } from "../../../lib/utils";
import { formatDate, SectionHeader, StatusPill } from "../helpers";

export function OperationsTab({
  jobs,
  onAction,
  onInspectRun,
}: {
  jobs: RecentJobsResponse | null;
  onAction: (action: "scan" | "velocity" | "quality" | "lens-backfill") => void;
  onInspectRun: (runId: string) => void;
}) {
  const actions = [
    {
      id: "scan" as const,
      title: "Manual update scan",
      description: "Queue quick update tasks for active signals stale for 24h.",
    },
    {
      id: "velocity" as const,
      title: "Velocity recalculation",
      description: "Recalculate trend velocity for all active signals.",
    },
    {
      id: "quality" as const,
      title: "Quality recalculation",
      description: "Recompute signal quality scores across all cards.",
    },
    {
      id: "lens-backfill" as const,
      title: "Lens classification backfill",
      description: "Backfill lens metadata for up to 100 cards.",
    },
  ];

  const renderRows = (
    rows: Array<Record<string, unknown>>,
    title: string,
    options: { onClickRow?: (id: string) => void } = {},
  ) => (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.slice(0, 12).map((row, index) => {
              const id = typeof row.id === "string" ? row.id : null;
              const clickable = Boolean(id && options.onClickRow);
              const onActivate =
                clickable && id ? () => options.onClickRow?.(id) : undefined;
              return (
                <tr
                  key={String(row.id || index)}
                  className={cn(
                    clickable &&
                      "cursor-pointer transition-colors hover:bg-brand-blue/5 focus-within:bg-brand-blue/5 dark:hover:bg-brand-blue/10 dark:focus-within:bg-brand-blue/10",
                  )}
                  onClick={onActivate}
                >
                  <td className="px-4 py-3">
                    {clickable ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onActivate?.();
                        }}
                        className="-mx-1 flex w-full items-center gap-2 rounded px-1 text-left font-medium text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue dark:text-white"
                        aria-label={`Inspect run ${String(row.id || "")}`}
                      >
                        {String(
                          row.task_type || row.triggered_by || row.id || "Job",
                        )}
                        <Telescope className="h-3.5 w-3.5 text-gray-400" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                        {String(
                          row.task_type || row.triggered_by || row.id || "Job",
                        )}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      {formatDate(row.created_at || row.started_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusPill status={row.status} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500">
                  No recent jobs
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader
        title="Operations"
        description="Trigger controlled background jobs and inspect recent task state."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            className="rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-blue hover:bg-brand-blue/5 dark:border-gray-700 dark:bg-dark-surface"
          >
            <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <Play className="h-4 w-4 text-brand-blue" />
              {action.title}
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {action.description}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {renderRows(jobs?.research_tasks || [], "Research tasks")}
        {renderRows(jobs?.discovery_runs || [], "Discovery runs", {
          onClickRow: onInspectRun,
        })}
        {renderRows(jobs?.workstream_scans || [], "Workstream scans")}
      </div>
    </div>
  );
}
