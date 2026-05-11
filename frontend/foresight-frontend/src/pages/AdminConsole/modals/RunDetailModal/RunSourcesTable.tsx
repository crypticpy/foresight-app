/**
 * Paginated table of the discovered sources for a single run. Each row
 * shows the URL, the per-source triage outcome, processing status, and a
 * link to the resulting card if one was created or enriched.
 *
 * @module pages/AdminConsole/modals/RunDetailModal/RunSourcesTable
 */

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import { type AdminRunDetailResponse } from "../../../../lib/admin-api";
import { ProcessingStatusBadge } from "./constants";

export function RunSourcesTable({
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
