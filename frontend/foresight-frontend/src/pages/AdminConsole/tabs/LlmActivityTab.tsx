/**
 * LLM activity tab — paginated, filterable list of LLM usage events
 * with click-to-detail. The list endpoint omits prompt/response excerpts;
 * the detail endpoint returns the full redacted payload.
 *
 * @module pages/AdminConsole/tabs/LlmActivityTab
 */

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";

import {
  type LlmAuditEventListItem,
  type LlmAuditEventsParams,
} from "../../../lib/admin-api";
import { formatDate, formatMoney, SectionHeader, StatusPill } from "../helpers";

export function LlmActivityTab({
  events,
  loading,
  filters,
  page,
  onFilterChange,
  onPageChange,
  onRefresh,
  onSelect,
  onExport,
}: {
  events: LlmAuditEventListItem[];
  loading: boolean;
  filters: LlmAuditEventsParams;
  page: { offset: number; nextOffset: number | null };
  onFilterChange: (next: Partial<LlmAuditEventsParams>) => void;
  onPageChange: (offset: number) => void;
  onRefresh: () => void;
  onSelect: (eventId: string) => void;
  onExport: () => void;
}) {
  return (
    <div>
      <SectionHeader
        title="LLM activity"
        description="Audit trail of every LLM call. Prompt / response excerpts are redacted (PII / secrets) and only persisted when the FORESIGHT_AUDIT_LLM_CONTENT setting is enabled."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
            >
              <Download className="h-4 w-4" />
              Export
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

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-dark-surface md:grid-cols-4">
        <input
          type="text"
          value={filters.operation ?? ""}
          onChange={(event) =>
            onFilterChange({ operation: event.target.value || undefined })
          }
          placeholder="Operation (e.g. openai.chat.completions)"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        />
        <input
          type="text"
          value={filters.model ?? ""}
          onChange={(event) =>
            onFilterChange({ model: event.target.value || undefined })
          }
          placeholder="Model"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        />
        <select
          value={filters.status ?? ""}
          onChange={(event) =>
            onFilterChange({ status: event.target.value || undefined })
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        >
          <option value="">Any status</option>
          <option value="success">success</option>
          <option value="error">error</option>
          <option value="stream_started">stream_started</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={Boolean(filters.audited_only)}
            onChange={(event) =>
              onFilterChange({ audited_only: event.target.checked })
            }
            className="h-4 w-4"
          />
          Audited only (chat / responses)
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-dark-surface-elevated">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Time
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Operation / model
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">
                  Tokens
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">
                  Cost
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Flags
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {events.map((event) => (
                <tr
                  key={event.id}
                  onClick={() => onSelect(event.id)}
                  className="cursor-pointer align-top hover:bg-gray-50 dark:hover:bg-dark-surface-hover"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {formatDate(event.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-gray-900 dark:text-white">
                      {event.operation || "—"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {event.model || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={event.status} />
                    {event.error_type && (
                      <div className="mt-1 text-xs text-red-500">
                        {event.error_type}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-200">
                    {event.total_tokens ?? "—"}
                    {event.cached_input_tokens ? (
                      <div className="text-xs text-gray-500">
                        {event.cached_input_tokens} cached
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-200">
                    {event.estimated_cost_usd != null
                      ? formatMoney(event.estimated_cost_usd)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {event.redaction_flags &&
                    event.redaction_flags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {event.redaction_flags.map((flag) => (
                          <span
                            key={flag}
                            className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {events.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    No LLM events match these filters.
                  </td>
                </tr>
              )}
              {loading && events.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-dark-surface-elevated">
          <span className="text-xs text-gray-500">
            Offset {page.offset}
            {page.nextOffset != null ? "" : " · last page"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page.offset === 0 || loading}
              onClick={() =>
                onPageChange(Math.max(0, page.offset - (filters.limit ?? 50)))
              }
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={page.nextOffset == null || loading}
              onClick={() =>
                page.nextOffset != null && onPageChange(page.nextOffset)
              }
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
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
