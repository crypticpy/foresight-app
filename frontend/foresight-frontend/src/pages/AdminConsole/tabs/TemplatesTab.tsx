/**
 * Templates tab — read-only inspector for org-owned workstream templates.
 * Surfaces name, description, scoping chips, and per-stage card counts so an
 * admin can spot empty / oversized pools without leaving the console.
 *
 * @module pages/AdminConsole/tabs/TemplatesTab
 */

import { Link } from "react-router-dom";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { cn } from "../../../lib/utils";
import { formatDate, SectionHeader } from "../helpers";
import type { TemplateRow } from "../hooks/useTemplates";

const HORIZON_LABELS: Record<string, string> = {
  NOW: "Now",
  NEXT: "Next",
  LATER: "Later",
  ALL: "All horizons",
};

function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "active" | "inactive";
}) {
  const toneClasses = {
    neutral:
      "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-dark-surface dark:text-gray-300",
    active:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300",
    inactive:
      "border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        toneClasses,
      )}
    >
      {children}
    </span>
  );
}

function CountBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "blue" | "purple" | "green" | "gray";
}) {
  const toneClasses = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
    purple:
      "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
    green:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
    gray: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  }[tone];

  return (
    <div className="flex flex-col items-center">
      <span
        className={cn(
          "inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-md px-2 text-sm font-semibold",
          toneClasses,
        )}
      >
        {value === null ? "…" : value}
      </span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
    </div>
  );
}

export function TemplatesTab({
  rows,
  loading,
  onRefresh,
}: {
  rows: TemplateRow[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SectionHeader
          title="Workstream templates"
          description="Org-owned templates that are cloned to each user on first touch and during the Friday fan-out. Editing happens in the per-template kanban — this view is for triage."
        />
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
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-dark-surface">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading templates…
            </p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No org-owned workstreams found. Templates appear here once a row
              in <code>workstreams</code> has <code>owner_type = "org"</code>.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ workstream, counts }) => (
            <div
              key={workstream.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-dark-surface"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      {workstream.name}
                    </h3>
                    <Chip tone={workstream.is_active ? "active" : "inactive"}>
                      {workstream.is_active ? "Active" : "Inactive"}
                    </Chip>
                  </div>
                  {workstream.description && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {workstream.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {workstream.horizon && (
                      <Chip>
                        {HORIZON_LABELS[workstream.horizon] ??
                          workstream.horizon}
                      </Chip>
                    )}
                    {workstream.pillar_ids?.length > 0 && (
                      <Chip>{workstream.pillar_ids.length} pillars</Chip>
                    )}
                    {workstream.goal_ids?.length > 0 && (
                      <Chip>{workstream.goal_ids.length} CSP goals</Chip>
                    )}
                    {workstream.stage_ids?.length > 0 && (
                      <Chip>{workstream.stage_ids.length} stages</Chip>
                    )}
                    {workstream.keywords?.length > 0 && (
                      <Chip>{workstream.keywords.length} keywords</Chip>
                    )}
                    {workstream.framework_code && (
                      <Chip>{workstream.framework_code}</Chip>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Created {formatDate(workstream.created_at)} · ID{" "}
                    <code>{workstream.id.slice(0, 8)}</code>
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  <CountBadge
                    label="Inbox"
                    value={counts?.inbox ?? null}
                    tone="blue"
                  />
                  <CountBadge
                    label="Working"
                    value={counts?.working ?? null}
                    tone="purple"
                  />
                  <CountBadge
                    label="Ready"
                    value={counts?.ready ?? null}
                    tone="green"
                  />
                  <CountBadge
                    label="Archived"
                    value={counts?.archived ?? null}
                    tone="gray"
                  />
                  <Link
                    to={`/workstreams/${workstream.id}/board`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
                  >
                    Open
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
