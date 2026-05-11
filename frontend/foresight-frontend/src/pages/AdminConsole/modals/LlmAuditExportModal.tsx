/**
 * LLM audit export modal — pick CSV / NDJSON, preview the active filter
 * snapshot, kick off the streamed download. The filter state mirrors what
 * the list endpoint is currently using; we do not re-issue date pickers
 * here on purpose so the export always matches what's visible in the table.
 *
 * @module pages/AdminConsole/modals/LlmAuditExportModal
 */

import React, { useState } from "react";
import { Download, Loader2, X } from "lucide-react";

import { type LlmAuditEventsParams } from "../../../lib/admin-api";
import { formatMoney } from "../helpers";

export function LlmAuditExportModal({
  filters,
  exporting,
  onClose,
  onDownload,
}: {
  filters: LlmAuditEventsParams;
  exporting: boolean;
  onClose: () => void;
  onDownload: (format: "csv" | "json") => void | Promise<void>;
}) {
  const [format, setFormat] = useState<"csv" | "json">("csv");

  const filterRows: Array<[string, string]> = [
    ["Operation", filters.operation || "—"],
    ["Model", filters.model || "—"],
    ["Status", filters.status || "—"],
    [
      "Audited only",
      filters.audited_only ? "yes (chat / responses only)" : "no",
    ],
    ["From", filters.from || "—"],
    ["To", filters.to || "—"],
    [
      "Min cost",
      filters.min_cost != null ? formatMoney(filters.min_cost) : "—",
    ],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-dark-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Export LLM events
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Streams up to 10,000 rows matching the current filters.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={exporting}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-dark-surface-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-gray-400">
              Format
            </label>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                <input
                  type="radio"
                  name="export-format"
                  value="csv"
                  checked={format === "csv"}
                  onChange={() => setFormat("csv")}
                />
                CSV
              </label>
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                <input
                  type="radio"
                  name="export-format"
                  value="json"
                  checked={format === "json"}
                  onChange={() => setFormat("json")}
                />
                NDJSON
              </label>
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-gray-400">
              Filter snapshot
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-dark-surface-elevated">
              {filterRows.map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-gray-900 dark:text-white">{value}</dd>
                </React.Fragment>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-gray-500">
              Includes redacted prompt / response excerpts when present.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onDownload(format)}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
