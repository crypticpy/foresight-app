/**
 * Pillar + workstream coverage hook — both payloads in one call, with a
 * generation-token guard so a slow response can't clobber a window the
 * operator has already moved past. Also owns the per-workstream force-scan
 * trigger and the refresh + window-change actions surfaced by the tab UI.
 *
 * @module pages/AdminConsole/hooks/useCoverage
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  adminForceWorkstreamScan,
  fetchPillarCoverage,
  fetchWorkstreamCoverage,
  type CoverageWindowDays,
  type PillarCoverageResponse,
  type WorkstreamCoverageItem,
} from "../../../lib/admin-api";
import { getToken, type AdminTab } from "../helpers";

export function useCoverage({
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
  const [pillarCoverage, setPillarCoverage] =
    useState<PillarCoverageResponse | null>(null);
  const [workstreamCoverage, setWorkstreamCoverage] = useState<
    WorkstreamCoverageItem[]
  >([]);
  const [days, setDays] = useState<CoverageWindowDays>(7);
  const [loading, setLoading] = useState(false);
  // True once we've attempted (success or fail) the lazy coverage load for
  // this session. Without this flag, a failed fetch would leave
  // `pillarCoverage === null` and the open-tab effect would keep re-firing,
  // hammering the API in a tight retry loop.
  const [attempted, setAttempted] = useState(false);
  // Per-window generation token. Used to skip a slow response when the
  // operator has already moved on to a different window — without this,
  // a 7d response landing after the user clicked 30d would clobber the
  // newer data.
  const genRef = useRef(0);

  // Coverage data is fetched together so the tab renders both widgets in
  // one shot. Pillar window changes refetch only the pillar payload to
  // avoid re-counting workstream scans for a UI-only knob.
  const loadAll = useCallback(
    async (windowDays: CoverageWindowDays) => {
      setLoading(true);
      const gen = ++genRef.current;
      try {
        const token = await getToken();
        const [pillars, workstreams] = await Promise.all([
          fetchPillarCoverage(token, windowDays),
          fetchWorkstreamCoverage(token),
        ]);
        // Stale-overwrite guard: bail if the operator changed windows mid-flight.
        if (gen !== genRef.current) return;
        setPillarCoverage(pillars);
        setWorkstreamCoverage(workstreams.items);
      } catch (err) {
        if (gen !== genRef.current) return;
        onError(err instanceof Error ? err.message : "Failed to load coverage");
      } finally {
        // Always flip the attempted flag so a failed first load can't loop.
        setAttempted(true);
        setLoading(false);
      }
    },
    [onError],
  );

  const loadPillarOnly = useCallback(
    async (windowDays: CoverageWindowDays) => {
      const gen = ++genRef.current;
      try {
        const token = await getToken();
        const pillars = await fetchPillarCoverage(token, windowDays);
        if (gen !== genRef.current) return;
        setPillarCoverage(pillars);
      } catch (err) {
        if (gen !== genRef.current) return;
        onError(
          err instanceof Error
            ? err.message
            : "Failed to refresh pillar window",
        );
      }
    },
    [onError],
  );

  // Lazy-load coverage when the tab is first opened. Subsequent window
  // changes hit loadPillarOnly so we don't re-aggregate the WS table.
  // Gate on `attempted` (not `pillarCoverage === null`) so a failed initial
  // fetch doesn't keep re-firing this effect.
  useEffect(() => {
    if (isAdmin && activeTab === "coverage" && !attempted && !loading) {
      loadAll(days);
    }
  }, [isAdmin, activeTab, attempted, loading, days, loadAll]);

  const changeWindow = useCallback(
    (next: CoverageWindowDays) => {
      setDays(next);
      // Refetch pillar payload only; WS freshness doesn't depend on the
      // pillar window.
      loadPillarOnly(next);
    },
    [loadPillarOnly],
  );

  const refresh = useCallback(() => loadAll(days), [days, loadAll]);

  const forceScan = useCallback(
    async (workstreamId: string) => {
      try {
        const token = await getToken();
        const result = await adminForceWorkstreamScan(token, workstreamId);
        onNotice(`Scan ${result.scan_id.slice(0, 8)} queued`);
        // Refresh WS table so the new scans_30d count and (eventually)
        // last_scanned_at reflect the new run. Pillar data is unaffected.
        const ws = await fetchWorkstreamCoverage(token);
        setWorkstreamCoverage(ws.items);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to force scan");
      }
    },
    [onError, onNotice],
  );

  return {
    pillarCoverage,
    workstreamCoverage,
    days,
    loading,
    changeWindow,
    refresh,
    forceScan,
  };
}
