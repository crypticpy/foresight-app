/**
 * Single row in the schedules table — name + toggle + interval + chips
 * for selected pillars/categories + last/next run + edit/delete buttons.
 *
 * @module pages/AdminConsole/tabs/SchedulesTab/ScheduleRow
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { type AdminSchedule } from "../../../../lib/admin-api";
import { cn } from "../../../../lib/utils";
import { formatDate } from "../../helpers";

export function ScheduleRow({
  schedule,
  onToggle,
  onEdit,
  onDelete,
}: {
  schedule: AdminSchedule;
  onToggle: (enabled: boolean) => Promise<void>;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  const handleToggle = async () => {
    setPending(true);
    try {
      await onToggle(!schedule.enabled);
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete schedule "${schedule.name}"? Past discovery_runs are kept; only the schedule row is removed.`,
      )
    ) {
      return;
    }
    setPending(true);
    try {
      await onDelete();
    } finally {
      setPending(false);
    }
  };

  return (
    <tr
      className={cn(
        "text-sm",
        !schedule.enabled && "opacity-60",
        pending && "animate-pulse",
      )}
    >
      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
        {schedule.name}
        {schedule.notes && (
          <div className="text-xs font-normal text-gray-500 dark:text-gray-400">
            {schedule.notes}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          className={cn(
            "inline-flex h-5 w-9 items-center rounded-full transition-colors",
            schedule.enabled ? "bg-brand-blue" : "bg-gray-300 dark:bg-gray-600",
            pending && "opacity-60",
          )}
          aria-pressed={schedule.enabled}
          aria-label={schedule.enabled ? "Disable schedule" : "Enable schedule"}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              schedule.enabled ? "translate-x-4" : "translate-x-1",
            )}
          />
        </button>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
        {schedule.interval_hours}h
      </td>
      <td className="px-4 py-3">
        {schedule.pillars_to_scan.length === 0 ? (
          <span className="text-xs italic text-gray-500 dark:text-gray-400">
            all pillars
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {schedule.pillars_to_scan.map((p) => (
              <span
                key={p}
                className="rounded bg-brand-blue/10 px-1.5 py-0.5 text-xs font-medium text-brand-blue"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {schedule.categories_to_scan.length === 0 ? (
          <span className="text-xs italic text-gray-500 dark:text-gray-400">
            all live
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {schedule.categories_to_scan.map((c) => (
              <span
                key={c}
                className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
        {schedule.last_run_at ? formatDate(schedule.last_run_at) : "—"}
        {schedule.last_run_status && (
          <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {schedule.last_run_status}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
        {schedule.next_run_at ? formatDate(schedule.next_run_at) : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-200"
            title="Edit schedule"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
            title="Delete schedule"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
