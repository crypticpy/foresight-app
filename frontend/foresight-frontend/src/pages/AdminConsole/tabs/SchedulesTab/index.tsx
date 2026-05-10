/**
 * Schedules tab — cron-style discovery schedule rows plus a global
 * demo-freeze toggle that pauses every automatic fire from the worker.
 *
 * @module pages/AdminConsole/tabs/SchedulesTab
 */

import { useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";

import {
  type AdminSchedule,
  type AdminScheduleCreateBody,
  type AdminScheduleUpdateBody,
  type AdminSetting,
} from "../../../../lib/admin-api";
import { cn } from "../../../../lib/utils";
import { SectionHeader } from "../../helpers";
import { ScheduleRow } from "./ScheduleRow";
import { ScheduleFormModal } from "./ScheduleFormModal";

export function SchedulesTab({
  schedules,
  loading,
  demoFreezeSetting,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  onToggleDemoFreeze,
}: {
  schedules: AdminSchedule[];
  loading: boolean;
  demoFreezeSetting: AdminSetting | null;
  onRefresh: () => Promise<void>;
  onCreate: (body: AdminScheduleCreateBody) => Promise<void>;
  onUpdate: (id: string, patch: AdminScheduleUpdateBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleDemoFreeze: (next: boolean) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminSchedule | null>(null);
  const [freezePending, setFreezePending] = useState(false);

  const demoFreezeOn = Boolean(demoFreezeSetting?.value);

  const handleFreezeToggle = async () => {
    if (!demoFreezeSetting) return;
    setFreezePending(true);
    try {
      await onToggleDemoFreeze(!demoFreezeOn);
    } finally {
      setFreezePending(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (schedule: AdminSchedule) => {
    setEditing(schedule);
    setShowForm(true);
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          title="Discovery schedules"
          description="Each row is one cron-style schedule the worker polls. Create per-pillar or per-category schedules; the global pause stops every automatic fire."
        />
        <div className="flex flex-col gap-2 lg:items-end">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
              demoFreezeOn
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-200",
            )}
          >
            <span className="font-medium">
              {demoFreezeOn ? "Automatic fires paused" : "Automatic fires live"}
            </span>
            <button
              type="button"
              onClick={handleFreezeToggle}
              disabled={!demoFreezeSetting || freezePending}
              className={cn(
                "inline-flex h-5 w-9 items-center rounded-full transition-colors",
                demoFreezeOn ? "bg-amber-500" : "bg-emerald-500",
                (!demoFreezeSetting || freezePending) && "opacity-60",
              )}
              aria-pressed={demoFreezeOn}
              aria-label={demoFreezeOn ? "Resume schedules" : "Pause schedules"}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  demoFreezeOn ? "translate-x-4" : "translate-x-1",
                )}
              />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue/90"
            >
              <Plus className="h-4 w-4" />
              New schedule
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
        {schedules.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {loading
              ? "Loading schedules…"
              : "No schedules yet. Create one to enable automatic discovery runs."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-dark-surface-deep/40 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2 text-center">Enabled</th>
                  <th className="px-4 py-2 text-right">Interval</th>
                  <th className="px-4 py-2">Pillars</th>
                  <th className="px-4 py-2">Categories</th>
                  <th className="px-4 py-2">Last run</th>
                  <th className="px-4 py-2">Next run</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {schedules.map((schedule) => (
                  <ScheduleRow
                    key={schedule.id}
                    schedule={schedule}
                    onToggle={(enabled) => onUpdate(schedule.id, { enabled })}
                    onEdit={() => openEdit(schedule)}
                    onDelete={() => onDelete(schedule.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ScheduleFormModal
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSubmit={async (body) => {
            if (editing) {
              await onUpdate(editing.id, body);
            } else {
              await onCreate(body as AdminScheduleCreateBody);
            }
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
