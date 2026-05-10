/**
 * Schedules tab — cron-style discovery schedule rows plus a global
 * demo-freeze toggle that pauses every automatic fire from the worker.
 *
 * @module pages/AdminConsole/tabs/SchedulesTab
 */

import React, { useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";

import {
  type AdminSchedule,
  type AdminScheduleCreateBody,
  type AdminScheduleUpdateBody,
  type AdminSetting,
  type SchedulePillar,
  type SourceCategory,
} from "../../../lib/admin-api";
import { cn } from "../../../lib/utils";
import { formatDate, SectionHeader } from "../helpers";

const SCHEDULE_PILLARS: ReadonlyArray<{
  code: SchedulePillar;
  label: string;
}> = [
  { code: "CH", label: "Community Health" },
  { code: "EW", label: "Economic & Workforce" },
  { code: "HG", label: "High-Performing Gov" },
  { code: "HH", label: "Homelessness & Housing" },
  { code: "MC", label: "Mobility & Infrastructure" },
  { code: "PS", label: "Public Safety" },
];

const SCHEDULE_CATEGORIES: ReadonlyArray<{
  code: SourceCategory;
  label: string;
}> = [
  { code: "rss", label: "RSS" },
  { code: "news", label: "News API" },
  { code: "academic", label: "Academic" },
  { code: "government", label: "Government" },
  { code: "tech_blog", label: "Tech blogs" },
  { code: "web_search", label: "Web search" },
];

// Compute the next N firing times so operators can sanity-check the schedule
// before saving. Uses the same precedence the backend's scheduler does:
// next_run_at if present, otherwise last_run_at + interval, otherwise now.
function computeNextRuns(
  schedule: {
    interval_hours?: number | null;
    next_run_at?: string | null;
    last_run_at?: string | null;
  },
  count = 5,
): Date[] {
  const interval = Math.max(1, Math.round(schedule.interval_hours ?? 24));
  const ms = interval * 60 * 60 * 1000;
  let anchor: Date;
  if (schedule.next_run_at) {
    anchor = new Date(schedule.next_run_at);
  } else if (schedule.last_run_at) {
    anchor = new Date(new Date(schedule.last_run_at).getTime() + ms);
  } else {
    anchor = new Date(Date.now() + ms);
  }
  if (Number.isNaN(anchor.getTime())) anchor = new Date(Date.now() + ms);
  // Roll forward if the anchor is in the past so the preview always shows
  // future fires — operators care about "what's next," not "what was missed."
  const now = Date.now();
  while (anchor.getTime() <= now) {
    anchor = new Date(anchor.getTime() + ms);
  }
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(new Date(anchor.getTime() + i * ms));
  }
  return out;
}

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

function ScheduleRow({
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

function ScheduleFormModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial: AdminSchedule | null;
  onClose: () => void;
  onSubmit: (body: AdminScheduleCreateBody) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [intervalHours, setIntervalHours] = useState(
    initial?.interval_hours ?? 24,
  );
  const [maxQueries, setMaxQueries] = useState(
    initial?.max_search_queries_per_run ?? 20,
  );
  const [processRssFirst, setProcessRssFirst] = useState(
    initial?.process_rss_first ?? true,
  );
  const [pillars, setPillars] = useState<SchedulePillar[]>(
    initial?.pillars_to_scan ?? [],
  );
  const [categories, setCategories] = useState<SourceCategory[]>(
    initial?.categories_to_scan ?? [],
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const togglePillar = (code: SchedulePillar) =>
    setPillars((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code],
    );

  const toggleCategory = (code: SourceCategory) =>
    setCategories((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );

  const previewRuns = useMemo(
    () =>
      computeNextRuns({
        interval_hours: intervalHours,
        next_run_at: initial?.next_run_at ?? null,
        last_run_at: initial?.last_run_at ?? null,
      }),
    [intervalHours, initial?.next_run_at, initial?.last_run_at],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorText("Name is required");
      return;
    }
    setSubmitting(true);
    setErrorText(null);
    try {
      const body: AdminScheduleCreateBody = {
        name: name.trim(),
        enabled,
        interval_hours: intervalHours,
        max_search_queries_per_run: maxQueries,
        process_rss_first: processRssFirst,
        pillars_to_scan: pillars,
        categories_to_scan: categories,
        notes: notes.trim() || null,
      };
      await onSubmit(body);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl dark:bg-dark-surface"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {initial ? `Edit schedule: ${initial.name}` : "New schedule"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorText && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {errorText}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="col-span-1 sm:col-span-2 text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
              placeholder="Daily RSS scan, weekly deep search, …"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">
              Interval (hours)
            </span>
            <input
              type="number"
              min={1}
              max={168}
              value={intervalHours}
              onChange={(e) =>
                setIntervalHours(Math.max(1, Number(e.target.value)))
              }
              className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">
              Max search queries / run
            </span>
            <input
              type="number"
              min={1}
              max={200}
              value={maxQueries}
              onChange={(e) =>
                setMaxQueries(Math.max(1, Number(e.target.value)))
              }
              className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
            />
          </label>

          <div className="col-span-1 sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Pillars (empty = all)
            </span>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_PILLARS.map((p) => {
                const active = pillars.includes(p.code);
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => togglePillar(p.code)}
                    className={cn(
                      "rounded border px-2 py-1 text-xs font-medium",
                      active
                        ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-200",
                    )}
                    title={p.label}
                  >
                    {p.code}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="col-span-1 sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Categories (empty = all live)
            </span>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_CATEGORIES.map((c) => {
                const active = categories.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCategory(c.code)}
                    className={cn(
                      "rounded border px-2 py-1 text-xs font-medium",
                      active
                        ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-200",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="col-span-1 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Enabled
          </label>

          <label className="col-span-1 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={processRssFirst}
              onChange={(e) => setProcessRssFirst(e.target.checked)}
              className="h-4 w-4"
            />
            Process RSS before search
          </label>

          <label className="col-span-1 sm:col-span-2 text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
              placeholder="Owner, intent, anything operators should know."
            />
          </label>
        </div>

        <div className="mt-4 rounded border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-dark-surface-deep/40">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Next 5 runs (preview)
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-gray-700 dark:text-gray-300">
            {previewRuns.map((d, i) => (
              <li key={i} className="tabular-nums">
                {d.toLocaleString()}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? "Save changes" : "Create schedule"}
          </button>
        </div>
      </form>
    </div>
  );
}
