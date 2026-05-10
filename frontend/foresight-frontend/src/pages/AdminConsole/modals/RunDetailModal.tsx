/**
 * Discovery run detail modal + its read-only subviews. Paginates source
 * rows server-side and exposes recovery actions that are global (not
 * scoped to a single run).
 *
 * @module pages/AdminConsole/modals/RunDetailModal
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Play,
  Telescope,
  X,
} from "lucide-react";

import {
  fetchAdminRunDetail,
  type AdminRunDetailResponse,
} from "../../../lib/admin-api";
import { cn } from "../../../lib/utils";
import { formatDate, getToken, StatusPill } from "../helpers";

const RUN_DETAIL_PAGE_SIZE = 25;

const PROCESSING_STATUS_LABELS: Record<string, string> = {
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

const PROCESSING_STATUS_COLORS: Record<string, string> = {
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

function ProcessingStatusBadge({ status }: { status: string }) {
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

export function RunDetailModal({
  runId,
  onClose,
  onRecoveryAction,
}: {
  runId: string;
  onClose: () => void;
  onRecoveryAction: (
    action: "recover" | "reprocess" | "recover-analyzed",
  ) => Promise<void>;
}) {
  const [detail, setDetail] = useState<AdminRunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const loadPage = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const data = await fetchAdminRunDetail(token, runId, {
          limit: RUN_DETAIL_PAGE_SIZE,
          offset: nextOffset,
        });
        setDetail(data);
        setOffset(nextOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load run");
      } finally {
        setLoading(false);
      }
    },
    [runId],
  );

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  const totalPages = useMemo(() => {
    if (!detail) return 1;
    return Math.max(
      1,
      Math.ceil(detail.totals.sources_total / RUN_DETAIL_PAGE_SIZE),
    );
  }, [detail]);
  const currentPage = Math.floor(offset / RUN_DETAIL_PAGE_SIZE) + 1;

  const runRow = detail?.run;
  const totals = detail?.totals;

  const handleAction = async (
    action: "recover" | "reprocess" | "recover-analyzed",
  ) => {
    setActionInFlight(action);
    try {
      await onRecoveryAction(action);
    } finally {
      setActionInFlight(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-dark-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-2">
              <Telescope className="h-5 w-5 text-brand-blue" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Discovery run detail
              </h2>
              {runRow?.status && <StatusPill status={runRow.status} />}
            </div>
            <div className="mt-1 font-mono text-xs text-gray-500">{runId}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {loading && !detail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </div>
          ) : detail && runRow && totals ? (
            <div className="space-y-6">
              <RunSummaryGrid run={runRow} totals={totals} />
              <RunStageBreakdown totals={totals} />
              <RunActionBar onAction={handleAction} inFlight={actionInFlight} />
              <RunSourcesTable
                items={detail.sources.items}
                offset={offset}
                total={totals.sources_total}
                currentPage={currentPage}
                totalPages={totalPages}
                hasMore={detail.sources.has_more}
                onPrev={
                  offset > 0
                    ? () => loadPage(Math.max(0, offset - RUN_DETAIL_PAGE_SIZE))
                    : undefined
                }
                onNext={
                  detail.sources.has_more
                    ? () => loadPage(offset + RUN_DETAIL_PAGE_SIZE)
                    : undefined
                }
                disabled={loading}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RunSummaryGrid({
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

function RunStageBreakdown({
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

function RunActionBar({
  onAction,
  inFlight,
}: {
  onAction: (action: "recover" | "reprocess" | "recover-analyzed") => void;
  inFlight: string | null;
}) {
  const buttons: Array<{
    id: "recover" | "reprocess" | "recover-analyzed";
    label: string;
    description: string;
  }> = [
    {
      id: "recover",
      label: "Recover orphans",
      description: "Re-feed orphaned sources through the signal agent.",
    },
    {
      id: "reprocess",
      label: "Reprocess errored",
      description: "Re-run triage + analysis from scratch on errored sources.",
    },
    {
      id: "recover-analyzed",
      label: "Recover analyzed errors",
      description:
        "Use existing analysis to retry sources that failed at card creation.",
    },
  ];
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface-elevated">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
        Recovery actions
      </h3>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        These run against the global recovery date window — they are not scoped
        to this single run, but a stuck run is the most common reason to invoke
        them.
      </p>
      <div className="flex flex-wrap gap-2">
        {buttons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            disabled={inFlight !== null}
            onClick={() => onAction(btn.id)}
            title={btn.description}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-brand-blue hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
          >
            {inFlight === btn.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RunSourcesTable({
  items,
  offset,
  total,
  currentPage,
  totalPages,
  hasMore,
  onPrev,
  onNext,
  disabled,
}: {
  items: AdminRunDetailResponse["sources"]["items"];
  offset: number;
  total: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface-elevated">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Discovered sources
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            {total === 0
              ? "0 sources"
              : `${offset + 1}–${offset + items.length} of ${total}`}
          </span>
          <span className="text-gray-400">·</span>
          <span>
            Page {currentPage} / {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={disabled || !onPrev}
              onClick={onPrev}
              className="rounded-md border border-gray-300 p-1 text-gray-600 transition-colors hover:border-brand-blue hover:text-brand-blue disabled:opacity-40 dark:border-gray-600"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || !onNext || !hasMore}
              onClick={onNext}
              className="rounded-md border border-gray-300 p-1 text-gray-600 transition-colors hover:border-brand-blue hover:text-brand-blue disabled:opacity-40 dark:border-gray-600"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-dark-surface">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Pillar</th>
              <th className="px-4 py-2">Triage</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Card</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No discovered sources persisted for this run.
                </td>
              </tr>
            ) : (
              items.map((src) => (
                <tr key={src.id}>
                  <td className="max-w-md px-4 py-3">
                    <div className="truncate font-medium text-gray-900 dark:text-white">
                      {src.title || src.url}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 truncate hover:text-brand-blue"
                      >
                        {src.domain || src.url}
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    </div>
                    {src.error_message && (
                      <div className="mt-1 line-clamp-2 text-xs text-rose-600 dark:text-rose-400">
                        {src.error_stage ? `[${src.error_stage}] ` : ""}
                        {src.error_message}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                    {src.triage_primary_pillar || src.query_pillar || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {src.triage_is_relevant === true ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        passed
                        {src.triage_confidence != null
                          ? ` (${(src.triage_confidence * 100).toFixed(0)}%)`
                          : ""}
                      </span>
                    ) : src.triage_is_relevant === false ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        filtered
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <ProcessingStatusBadge status={src.processing_status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                    {src.resulting_card_id ? (
                      <span className="font-mono text-brand-blue">
                        {src.resulting_card_id.slice(0, 8)}…
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
