/**
 * Safety incidents hook — paginated list, filter state, expand/collapse, and
 * the two operator actions (per-row disposition update + manual abuse scan).
 * Uses a generation token to drop stale list responses when filters change
 * mid-flight.
 *
 * @module pages/AdminConsole/hooks/useSafety
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchSafetyIncidents,
  runSafetyAbuseScan,
  updateSafetyIncident,
  type SafetyDisposition,
  type SafetyIncidentsParams,
  type SafetyIncidentsResponse,
} from "../../../lib/safety-api";
import { getToken, type AdminTab } from "../helpers";

export function useSafety({
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
  // Offset is intentionally separate from filters so the fetch effect
  // doesn't retrigger when pagination advances.
  const [data, setData] = useState<SafetyIncidentsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SafetyIncidentsParams>({
    disposition: "open",
    limit: 50,
  });
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [abuseScanRunning, setAbuseScanRunning] = useState(false);
  const genRef = useRef(0);

  const load = useCallback(
    async (nextOffset: number) => {
      const myGen = ++genRef.current;
      setLoading(true);
      try {
        const token = await getToken();
        const response = await fetchSafetyIncidents(token, {
          ...filters,
          offset: nextOffset,
        });
        if (genRef.current !== myGen) return;
        setData(response);
        setOffset(response.offset);
      } catch (err) {
        if (genRef.current !== myGen) return;
        onError(
          err instanceof Error
            ? err.message
            : "Failed to load safety incidents",
        );
      } finally {
        if (genRef.current === myGen) setLoading(false);
      }
    },
    [filters, onError],
  );

  useEffect(() => {
    if (isAdmin && activeTab === "safety") {
      load(0);
    }
  }, [isAdmin, activeTab, load]);

  const updateFilters = useCallback((next: Partial<SafetyIncidentsParams>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const disposition = useCallback(
    async (incidentId: string, next: SafetyDisposition) => {
      try {
        const token = await getToken();
        await updateSafetyIncident(token, incidentId, { disposition: next });
        onNotice(`Marked incident as ${next.replace("_", " ")}`);
        load(offset);
      } catch (err) {
        onError(
          err instanceof Error ? err.message : "Failed to update incident",
        );
      }
    },
    [load, offset, onError, onNotice],
  );

  const runAbuseScan = useCallback(async () => {
    setAbuseScanRunning(true);
    try {
      const token = await getToken();
      const result = await runSafetyAbuseScan(token, 60);
      onNotice(
        `Abuse scan complete — ${result.findings.length} finding(s), ${result.inserted} new incident(s)`,
      );
      load(0);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Abuse scan failed");
    } finally {
      setAbuseScanRunning(false);
    }
  }, [load, onError, onNotice]);

  return {
    data,
    loading,
    filters,
    offset,
    expandedId,
    abuseScanRunning,
    load,
    updateFilters,
    toggleExpanded,
    disposition,
    runAbuseScan,
  };
}
