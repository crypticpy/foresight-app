/**
 * LLM audit hook — list, filters, page, detail-modal payload + replay,
 * export modal state, streamed download. Two generation tokens keep stale
 * list/detail responses from clobbering newer state, and a `selectedRef`
 * tracks which event the user actually wants to see so a slow detail
 * fetch can't reopen a dismissed modal.
 *
 * @module pages/AdminConsole/hooks/useLlmAudit
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  downloadLlmAuditExport,
  fetchLlmAuditEvent,
  fetchLlmAuditEvents,
  fetchLlmAuditReplay,
  type LlmAuditEventDetail,
  type LlmAuditEventListItem,
  type LlmAuditEventsParams,
  type LlmAuditExportFilters,
  type LlmAuditReplayResponse,
} from "../../../lib/admin-api";
import { getToken, type AdminTab } from "../helpers";

export function useLlmAudit({
  isAdmin,
  activeTab,
  onError,
  onNotice,
}: {
  isAdmin: boolean;
  activeTab: AdminTab;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [events, setEvents] = useState<LlmAuditEventListItem[]>([]);
  const [page, setPage] = useState<{
    offset: number;
    nextOffset: number | null;
  }>({ offset: 0, nextOffset: null });
  const [filters, setFilters] = useState<LlmAuditEventsParams>({
    audited_only: true,
    limit: 50,
  });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<LlmAuditEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replay, setReplay] = useState<LlmAuditReplayResponse | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Per-list-fetch generation token. Filter changes are debounced — without
  // this, an in-flight fetch for the previous filter set could land after
  // the user has typed a new filter and clobber the newer state.
  const listGenRef = useRef(0);
  const detailGenRef = useRef(0);
  const selectedRef = useRef<string | null>(null);

  const loadEvents = useCallback(
    async (offset: number) => {
      const myGen = ++listGenRef.current;
      setLoading(true);
      try {
        const token = await getToken();
        const response = await fetchLlmAuditEvents(token, {
          ...filters,
          offset,
        });
        // Skip stale responses if a newer fetch has already started.
        if (listGenRef.current !== myGen) return;
        setEvents(response.items);
        setPage({ offset: response.offset, nextOffset: response.next_offset });
      } catch (err) {
        if (listGenRef.current !== myGen) return;
        onError(
          err instanceof Error ? err.message : "Failed to load LLM activity",
        );
      } finally {
        if (listGenRef.current === myGen) setLoading(false);
      }
    },
    [filters, onError],
  );

  // Lazy-load when the tab opens or filters change. Resets to page 0.
  useEffect(() => {
    if (isAdmin && activeTab === "llm_activity") {
      loadEvents(0);
    }
  }, [isAdmin, activeTab, loadEvents]);

  const updateFilters = useCallback((next: Partial<LlmAuditEventsParams>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  const openDetail = useCallback(
    async (eventId: string) => {
      // Track which event the user actually wants to see. If they close the
      // modal or click a different row before this request resolves, we drop
      // the stale response instead of reopening a dismissed modal.
      const myGen = ++detailGenRef.current;
      selectedRef.current = eventId;
      setDetailLoading(true);
      setDetail({ id: eventId } as LlmAuditEventDetail);
      setReplay(null);
      let token: string;
      try {
        token = await getToken();
        const detailPayload = await fetchLlmAuditEvent(token, eventId);
        if (detailGenRef.current !== myGen || selectedRef.current !== eventId) {
          return;
        }
        setDetail(detailPayload);
        // Replay must not gate detail rendering — a slow /replay would leave
        // the modal stuck on "Loading event…" while the (already-fetched)
        // payload is invisible. Kick the replay off in the background and
        // flip the detail-loading flag now.
        setDetailLoading(false);
        if (detailPayload.conversation_id) {
          const convId = detailPayload.conversation_id;
          setReplayLoading(true);
          void (async () => {
            try {
              const replayPayload = await fetchLlmAuditReplay(token, convId);
              if (
                detailGenRef.current === myGen &&
                selectedRef.current === eventId
              ) {
                setReplay(replayPayload);
              }
            } catch (replayErr) {
              if (
                detailGenRef.current === myGen &&
                selectedRef.current === eventId
              ) {
                onError(
                  replayErr instanceof Error
                    ? replayErr.message
                    : "Failed to load replay",
                );
              }
            } finally {
              if (
                detailGenRef.current === myGen &&
                selectedRef.current === eventId
              ) {
                setReplayLoading(false);
              }
            }
          })();
        }
      } catch (err) {
        if (detailGenRef.current !== myGen || selectedRef.current !== eventId) {
          return;
        }
        setDetail(null);
        onError(
          err instanceof Error ? err.message : "Failed to load event detail",
        );
        setDetailLoading(false);
      }
    },
    [onError],
  );

  const closeDetail = useCallback(() => {
    selectedRef.current = null;
    setDetail(null);
    setReplay(null);
  }, []);

  const openExport = useCallback(() => setExportOpen(true), []);
  const closeExport = useCallback(() => setExportOpen(false), []);

  const downloadExport = useCallback(
    async (format: "csv" | "json") => {
      setExporting(true);
      try {
        const token = await getToken();
        const exportFilters: LlmAuditExportFilters = {
          operation: filters.operation,
          model: filters.model,
          status: filters.status,
          audited_only: filters.audited_only,
          from: filters.from,
          to: filters.to,
          min_cost: filters.min_cost,
          format,
        };
        const { blob, filename } = await downloadLlmAuditExport(
          token,
          exportFilters,
        );
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setExportOpen(false);
        onNotice(`Exported ${filename}`);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Export failed");
      } finally {
        setExporting(false);
      }
    },
    [filters, onError, onNotice],
  );

  return {
    events,
    page,
    filters,
    loading,
    detail,
    detailLoading,
    replay,
    replayLoading,
    exportOpen,
    exporting,
    loadEvents,
    updateFilters,
    openDetail,
    closeDetail,
    openExport,
    closeExport,
    downloadExport,
  };
}
