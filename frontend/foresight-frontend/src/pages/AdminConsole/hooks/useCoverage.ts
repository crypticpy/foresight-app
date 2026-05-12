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
  fetchCoverageGaps,
  fetchPillarCoverage,
  fetchWorkstreamCoverage,
  type CoverageGapsResponse,
  type CoverageWindowDays,
  type PillarCoverageMode,
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
  // Gap heatmap data. Loaded alongside pillar coverage and re-fetched on
  // the same window/mode changes so the two widgets stay in sync.
  const [gaps, setGaps] = useState<CoverageGapsResponse | null>(null);
  const [days, setDays] = useState<CoverageWindowDays>(7);
  // ``primary`` matches the legacy aggregation; operators flip to
  // ``primary_or_secondary`` or ``union`` to fold in ``secondary_pillars``
  // and ``csp_goal_ids`` respectively. Mode lives in hook state because it
  // affects the request and we want the UI to stay coherent on refresh.
  const [mode, setMode] = useState<PillarCoverageMode>("primary");
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
    async (windowDays: CoverageWindowDays, m: PillarCoverageMode) => {
      setLoading(true);
      const gen = ++genRef.current;
      try {
        const token = await getToken();
        const [pillars, workstreams, gapPayload] = await Promise.all([
          fetchPillarCoverage(token, windowDays, m),
          fetchWorkstreamCoverage(token),
          fetchCoverageGaps(token, windowDays),
        ]);
        // Stale-overwrite guard: bail if the operator changed windows mid-flight.
        if (gen !== genRef.current) return;
        setPillarCoverage(pillars);
        setWorkstreamCoverage(workstreams.items);
        setGaps(gapPayload);
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
    async (windowDays: CoverageWindowDays, m: PillarCoverageMode) => {
      const gen = ++genRef.current;
      try {
        const token = await getToken();
        // Window changes affect the gap heatmap too — re-fetch both so the
        // two widgets agree on the window. The WS table is unaffected.
        const [pillars, gapPayload] = await Promise.all([
          fetchPillarCoverage(token, windowDays, m),
          fetchCoverageGaps(token, windowDays),
        ]);
        if (gen !== genRef.current) return;
        setPillarCoverage(pillars);
        setGaps(gapPayload);
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
      loadAll(days, mode);
    }
  }, [isAdmin, activeTab, attempted, loading, days, mode, loadAll]);

  const changeWindow = useCallback(
    (next: CoverageWindowDays) => {
      setDays(next);
      // Refetch pillar payload only; WS freshness doesn't depend on the
      // pillar window.
      loadPillarOnly(next, mode);
    },
    [loadPillarOnly, mode],
  );

  const changeMode = useCallback(
    (next: PillarCoverageMode) => {
      // Clicking the active option shouldn't fire another fetch — the
      // radiogroup re-emits onClick even when the value doesn't change.
      if (next === mode) return;
      setMode(next);
      // Mode only affects the pillar payload, so reuse loadPillarOnly.
      loadPillarOnly(days, next);
    },
    [loadPillarOnly, days, mode],
  );

  const refresh = useCallback(() => loadAll(days, mode), [days, mode, loadAll]);

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
    gaps,
    days,
    mode,
    loading,
    changeWindow,
    changeMode,
    refresh,
    forceScan,
  };
}
