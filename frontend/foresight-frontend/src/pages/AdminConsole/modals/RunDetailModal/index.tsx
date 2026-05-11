/**
 * Discovery run detail modal — fetches one run + its first page of sources,
 * wires server-side pagination, and composes Summary / Stage breakdown /
 * Recovery actions / Sources table.
 *
 * @module pages/AdminConsole/modals/RunDetailModal
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Telescope, X } from "lucide-react";

import {
  fetchAdminRunDetail,
  type AdminRunDetailResponse,
} from "../../../../lib/admin-api";
import { getToken, StatusPill } from "../../helpers";
import { RUN_DETAIL_PAGE_SIZE } from "./constants";
import { RunSummaryGrid } from "./RunSummaryGrid";
import { RunStageBreakdown } from "./RunStageBreakdown";
import { RunActionBar } from "./RunActionBar";
import { RunSourcesTable } from "./RunSourcesTable";

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
