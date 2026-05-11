/**
 * Create / edit schedule modal — name, interval, pillar & category chips,
 * RSS ordering, notes, plus a live preview of the next 5 fires so operators
 * can sanity-check the schedule before saving.
 *
 * @module pages/AdminConsole/tabs/SchedulesTab/ScheduleFormModal
 */

import React, { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";

import {
  type AdminSchedule,
  type AdminScheduleCreateBody,
  type SchedulePillar,
  type SourceCategory,
} from "../../../../lib/admin-api";
import { cn } from "../../../../lib/utils";
import { SCHEDULE_CATEGORIES, SCHEDULE_PILLARS } from "./constants";
import { computeNextRuns } from "./computeNextRuns";

export function ScheduleFormModal({
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
