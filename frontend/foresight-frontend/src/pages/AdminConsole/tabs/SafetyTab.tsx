/**
 * Safety tab — prompt-injection matches + usage-anomaly findings awaiting
 * triage. High-severity injection patterns block the LLM call upstream;
 * abuse findings are advisory.
 *
 * @module pages/AdminConsole/tabs/SafetyTab
 */

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";

import {
  type SafetyDisposition,
  type SafetyIncident,
  type SafetyIncidentsParams,
  type SafetyIncidentsResponse,
} from "../../../lib/safety-api";
import { cn } from "../../../lib/utils";
import { formatDate, SectionHeader } from "../helpers";

export function SafetyTab({
  data,
  loading,
  filters,
  offset,
  expandedId,
  abuseScanRunning,
  onFilterChange,
  onExpandToggle,
  onPageChange,
  onRefresh,
  onDisposition,
  onRunAbuseScan,
}: {
  data: SafetyIncidentsResponse | null;
  loading: boolean;
  filters: SafetyIncidentsParams;
  offset: number;
  expandedId: string | null;
  abuseScanRunning: boolean;
  onFilterChange: (next: Partial<SafetyIncidentsParams>) => void;
  onExpandToggle: (id: string) => void;
  onPageChange: (offset: number) => void;
  onRefresh: () => void;
  onDisposition: (id: string, disposition: SafetyDisposition) => void;
  onRunAbuseScan: () => void;
}) {
  const items = data?.items ?? [];
  const nextOffset = data?.next_offset ?? null;
  const openCounts = data?.open_counts ?? { high: 0, medium: 0, low: 0 };

  return (
    <div>
      <SectionHeader
        title="Safety incidents"
        description="Prompt-injection matches and usage-anomaly findings awaiting admin triage. High-severity injection patterns block the LLM call upstream; abuse findings are advisory."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={onRunAbuseScan}
              disabled={abuseScanRunning}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
            >
              {abuseScanRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run abuse scan
            </button>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-700/40 dark:bg-red-950/30">
          <p className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
            Open · high
          </p>
          <p className="text-2xl font-semibold text-red-900 dark:text-red-100">
            {openCounts.high}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700/40 dark:bg-amber-950/30">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Open · medium
          </p>
          <p className="text-2xl font-semibold text-amber-900 dark:text-amber-100">
            {openCounts.medium}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-dark-surface">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
            Open · low
          </p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {openCounts.low}
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-dark-surface md:grid-cols-4">
        <select
          value={filters.kind ?? ""}
          onChange={(event) =>
            onFilterChange({
              kind:
                (event.target.value as SafetyIncidentsParams["kind"]) ||
                undefined,
            })
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        >
          <option value="">Any kind</option>
          <option value="injection">injection</option>
          <option value="abuse">abuse</option>
        </select>
        <select
          value={filters.severity ?? ""}
          onChange={(event) =>
            onFilterChange({
              severity:
                (event.target.value as SafetyIncidentsParams["severity"]) ||
                undefined,
            })
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        >
          <option value="">Any severity</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        <select
          value={filters.source ?? ""}
          onChange={(event) =>
            onFilterChange({
              source:
                (event.target.value as SafetyIncidentsParams["source"]) ||
                undefined,
            })
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        >
          <option value="">Any source</option>
          <option value="discovery">discovery</option>
          <option value="chat">chat</option>
          <option value="monitor">monitor</option>
        </select>
        <select
          value={filters.disposition ?? ""}
          onChange={(event) =>
            onFilterChange({
              disposition:
                (event.target.value as SafetyIncidentsParams["disposition"]) ||
                undefined,
            })
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        >
          <option value="">Any disposition</option>
          <option value="open">open (unreviewed)</option>
          <option value="true_positive">true positive</option>
          <option value="false_positive">false positive</option>
          <option value="needs_review">needs review</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-dark-surface-elevated">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
                When
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
                Kind
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
                Severity
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
                Source
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
                Pattern / category
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
                Disposition
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading && items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  No incidents match the current filters.
                </td>
              </tr>
            )}
            {items.map((row) => (
              <SafetyIncidentRow
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onExpandToggle={() => onExpandToggle(row.id)}
                onDisposition={(disposition) =>
                  onDisposition(row.id, disposition)
                }
              />
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <p className="text-xs text-gray-500">
            Showing rows {offset + 1}–{offset + items.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onPageChange(Math.max(0, offset - (filters.limit ?? 50)))
              }
              disabled={offset === 0}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-gray-600"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              onClick={() => nextOffset !== null && onPageChange(nextOffset)}
              disabled={nextOffset === null}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-gray-600"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SafetyIncidentRow({
  row,
  expanded,
  onExpandToggle,
  onDisposition,
}: {
  row: SafetyIncident;
  expanded: boolean;
  onExpandToggle: () => void;
  onDisposition: (disposition: SafetyDisposition) => void;
}) {
  const severityClasses: Record<string, string> = {
    high: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    medium:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  };

  return (
    <>
      <tr
        onClick={onExpandToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onExpandToggle();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        className="cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 dark:hover:bg-dark-surface-hover"
      >
        <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
          {formatDate(row.created_at)}
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
          {row.kind}
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-sm">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              severityClasses[row.severity] ?? "",
            )}
          >
            {row.severity}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-700 dark:text-gray-200">
          {row.source}
        </td>
        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200">
          <div className="font-mono text-xs">{row.pattern_id}</div>
          <div className="text-xs text-gray-500">{row.category}</div>
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
          {row.disposition ?? (
            <span className="text-amber-600">unreviewed</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 dark:bg-dark-surface-deep">
          <td colSpan={6} className="px-4 py-3">
            <div className="space-y-3 text-sm">
              {row.excerpt && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Excerpt
                  </p>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-white p-2 text-xs text-gray-800 dark:bg-dark-surface dark:text-gray-100">
                    {row.excerpt}
                  </pre>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {row.user_id && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      User
                    </p>
                    <p className="font-mono text-xs">{row.user_id}</p>
                  </div>
                )}
                {row.conversation_id && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Conversation
                    </p>
                    <p className="font-mono text-xs">{row.conversation_id}</p>
                  </div>
                )}
                {row.discovered_source_id && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Discovered source
                    </p>
                    <p className="font-mono text-xs">
                      {row.discovered_source_id}
                    </p>
                  </div>
                )}
              </div>
              {row.metadata && Object.keys(row.metadata).length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Metadata
                  </p>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-white p-2 text-xs text-gray-700 dark:bg-dark-surface dark:text-gray-200">
                    {JSON.stringify(row.metadata, null, 2)}
                  </pre>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDisposition("true_positive");
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700/50 dark:bg-red-950/30 dark:text-red-200"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Mark true positive
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDisposition("false_positive");
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 dark:border-green-700/50 dark:bg-green-950/30 dark:text-green-200"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark false positive
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDisposition("needs_review");
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
                >
                  Needs review
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
