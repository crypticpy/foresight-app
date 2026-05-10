/**
 * AdminConsole — slim composer that owns all admin-tab state and routes
 * tab activation to per-tab sub-modules. Tab-specific UI lives in
 * ./tabs/*; the two heavy modals live in ./modals/*.
 *
 * @module pages/AdminConsole
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Shield } from "lucide-react";

import {
  adminForceWorkstreamScan,
  applyDiscoveryPreset,
  createAdminSchedule,
  createAdminSource,
  deleteAdminSchedule,
  deleteAdminSource,
  downloadLlmAuditExport,
  fetchAdminAuditLog,
  fetchAdminOverview,
  fetchAdminSchedules,
  fetchAdminSettings,
  fetchAdminSources,
  fetchAdminUsers,
  fetchLlmAuditEvent,
  fetchLlmAuditEvents,
  fetchLlmAuditReplay,
  fetchPillarCoverage,
  fetchRecentJobs,
  fetchRecentUsage,
  fetchUsageSummary,
  fetchWorkstreamCoverage,
  triggerAdminAction,
  triggerDiscoveryRecover,
  triggerDiscoveryRecoverAnalyzed,
  triggerDiscoveryReprocess,
  updateAdminSchedule,
  updateAdminSetting,
  updateAdminSource,
  updateAdminUser,
  type AdminAuditEntry,
  type AdminOverview,
  type AdminSchedule,
  type AdminScheduleCreateBody,
  type AdminScheduleUpdateBody,
  type AdminSetting,
  type AdminSource,
  type AdminSourceCreateBody,
  type AdminSourceUpdateBody,
  type AdminUser,
  type CoverageWindowDays,
  type DiscoveryPreset,
  type LlmAuditEventDetail,
  type LlmAuditEventListItem,
  type LlmAuditEventsParams,
  type LlmAuditExportFilters,
  type LlmAuditReplayResponse,
  type PillarCoverageResponse,
  type RecentJobsResponse,
  type UsageEvent,
  type UsageSummary,
  type WorkstreamCoverageItem,
} from "../../lib/admin-api";
import {
  fetchCostBudget,
  resetCostGuardrail,
  type CostBudgetState,
} from "../../lib/cost-api";
import {
  fetchSafetyIncidents,
  runSafetyAbuseScan,
  updateSafetyIncident,
  type SafetyDisposition,
  type SafetyIncidentsParams,
  type SafetyIncidentsResponse,
} from "../../lib/safety-api";
import { useAuthContext } from "../../hooks/useAuthContext";
import { cn } from "../../lib/utils";

import { getToken, tabs, type AdminTab } from "./helpers";
import { LlmAuditDetailModal } from "./modals/LlmAuditDetailModal";
import { LlmAuditExportModal } from "./modals/LlmAuditExportModal";
import { RunDetailModal } from "./modals/RunDetailModal";
import { AuditLogTab } from "./tabs/AuditLogTab";
import { CoverageTab } from "./tabs/CoverageTab";
import { LlmActivityTab } from "./tabs/LlmActivityTab";
import { OperationsTab } from "./tabs/OperationsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { SafetyTab } from "./tabs/SafetyTab";
import { SchedulesTab } from "./tabs/SchedulesTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { SourcesTab } from "./tabs/SourcesTab";
import { UsageTab } from "./tabs/UsageTab";
import { UsersTab } from "./tabs/UsersTab";

const AdminConsole: React.FC = () => {
  const { profile } = useAuthContext();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [jobs, setJobs] = useState<RecentJobsResponse | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [recentUsage, setRecentUsage] = useState<UsageEvent[]>([]);
  const [usageDays, setUsageDays] = useState(7);
  const [costBudget, setCostBudget] = useState<CostBudgetState | null>(null);
  const [costResetting, setCostResetting] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [auditFilters, setAuditFilters] = useState<{
    target_type: "user" | "setting" | "";
    sinceDays: number;
  }>({ target_type: "", sinceDays: 7 });
  const [sources, setSources] = useState<AdminSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [pillarCoverage, setPillarCoverage] =
    useState<PillarCoverageResponse | null>(null);
  const [workstreamCoverage, setWorkstreamCoverage] = useState<
    WorkstreamCoverageItem[]
  >([]);
  const [coverageDays, setCoverageDays] = useState<CoverageWindowDays>(7);
  const [coverageLoading, setCoverageLoading] = useState(false);
  // True once we've attempted (success or fail) the lazy coverage load for
  // this session. Without this flag, a failed fetch would leave
  // `pillarCoverage === null` and the open-tab effect would keep re-firing,
  // hammering the API in a tight retry loop.
  const [coverageAttempted, setCoverageAttempted] = useState(false);
  // Per-window generation token. Used to skip a slow response when the
  // operator has already moved on to a different window — without this,
  // a 7d response landing after the user clicked 30d would clobber the
  // newer data.
  const coverageGenRef = useRef(0);
  const [inspectRunId, setInspectRunId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<AdminSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [llmAuditEvents, setLlmAuditEvents] = useState<LlmAuditEventListItem[]>(
    [],
  );
  const [llmAuditPage, setLlmAuditPage] = useState<{
    offset: number;
    nextOffset: number | null;
  }>({ offset: 0, nextOffset: null });
  const [llmAuditFilters, setLlmAuditFilters] = useState<LlmAuditEventsParams>({
    audited_only: true,
    limit: 50,
  });
  const [llmAuditLoading, setLlmAuditLoading] = useState(false);
  const [llmAuditDetail, setLlmAuditDetail] =
    useState<LlmAuditEventDetail | null>(null);
  const [llmAuditDetailLoading, setLlmAuditDetailLoading] = useState(false);
  // Per-list-fetch generation token. Filter changes are debounced — without
  // this, an in-flight fetch for the previous filter set could land after
  // the user has typed a new filter and clobber the newer state.
  const llmAuditGenRef = useRef(0);
  const llmAuditDetailGenRef = useRef(0);
  const llmAuditSelectedRef = useRef<string | null>(null);
  const [llmAuditReplay, setLlmAuditReplay] =
    useState<LlmAuditReplayResponse | null>(null);
  const [llmAuditReplayLoading, setLlmAuditReplayLoading] = useState(false);
  const [llmAuditExportOpen, setLlmAuditExportOpen] = useState(false);
  const [llmAuditExporting, setLlmAuditExporting] = useState(false);

  // Safety tab state. Offset is intentionally separate from filters so the
  // fetch effect doesn't retrigger when pagination advances.
  const [safetyData, setSafetyData] = useState<SafetyIncidentsResponse | null>(
    null,
  );
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyFilters, setSafetyFilters] = useState<SafetyIncidentsParams>({
    disposition: "open",
    limit: 50,
  });
  const [safetyOffset, setSafetyOffset] = useState(0);
  const [safetyExpandedId, setSafetyExpandedId] = useState<string | null>(null);
  const [safetyAbuseScanRunning, setSafetyAbuseScanRunning] = useState(false);
  const safetyGenRef = useRef(0);

  const isAdmin = profile?.role === "admin" || profile?.role === "service_role";

  // loadAll fetches everything except usage (which is parameterized by
  // usageDays). Splitting them prevents a full console reload every time
  // the user changes the usage window.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [overviewData, usersData, settingsData, jobsData] =
        await Promise.all([
          fetchAdminOverview(token),
          fetchAdminUsers(token),
          fetchAdminSettings(token),
          fetchRecentJobs(token),
        ]);
      setOverview(overviewData);
      setUsers(usersData.items);
      setSettings(settingsData.items);
      setJobs(jobsData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load admin data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const token = await getToken();
      const [usageData, recentData, budgetData] = await Promise.all([
        fetchUsageSummary(token, usageDays),
        fetchRecentUsage(token, 50),
        fetchCostBudget(token).catch(() => null),
      ]);
      setUsage(usageData);
      setRecentUsage(recentData);
      setCostBudget(budgetData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage");
    }
  }, [usageDays]);

  const handleResetCostGuardrail = useCallback(async () => {
    setCostResetting(true);
    try {
      const token = await getToken();
      const updated = await resetCostGuardrail(token);
      setCostBudget(updated);
      setNotice("Cost guardrail reset.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset guardrail",
      );
    } finally {
      setCostResetting(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const token = await getToken();
      const since =
        auditFilters.sinceDays > 0
          ? new Date(
              Date.now() - auditFilters.sinceDays * 24 * 60 * 60 * 1000,
            ).toISOString()
          : undefined;
      const data = await fetchAdminAuditLog(token, {
        limit: 200,
        target_type: auditFilters.target_type || undefined,
        since,
      });
      setAuditEntries(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log");
    }
  }, [auditFilters.target_type, auditFilters.sinceDays]);

  useEffect(() => {
    if (isAdmin) loadAll();
  }, [isAdmin, loadAll]);

  useEffect(() => {
    if (isAdmin) loadUsage();
  }, [isAdmin, loadUsage]);

  useEffect(() => {
    if (isAdmin) loadAudit();
  }, [isAdmin, loadAudit]);

  // Refresh-console button: refetch everything, including usage and audit.
  // loadAll on its own omits the windowed sections by design (so changing
  // the usage / audit window doesn't re-pull the rest of the console).
  const refreshAll = useCallback(() => {
    loadAll();
    loadUsage();
    loadAudit();
  }, [loadAll, loadUsage, loadAudit]);

  const refreshUsers = useCallback(
    async (
      filters: { search?: string; account_type?: string; role?: string } = {},
    ) => {
      try {
        const token = await getToken();
        const data = await fetchAdminUsers(token, filters);
        setUsers(data.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users");
      }
    },
    [],
  );

  const saveUser = useCallback(
    async (user: AdminUser, patch: Partial<AdminUser>) => {
      try {
        const token = await getToken();
        const updated = await updateAdminUser(token, user.id, patch);
        setUsers((prev) =>
          prev.map((item) => (item.id === user.id ? updated : item)),
        );
        setNotice("User updated");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update user");
      }
    },
    [],
  );

  const saveSetting = useCallback(
    async (setting: AdminSetting, value: unknown) => {
      try {
        const token = await getToken();
        await updateAdminSetting(token, setting.key, value);
        const refreshed = await fetchAdminSettings(token);
        setSettings(refreshed.items);
        // Cost-guardrail settings change what the Usage tab guardrail panel
        // shows, so re-pull the budget snapshot rather than waiting for the
        // operator to refresh the page or change usage windows.
        if (setting.key.startsWith("FORESIGHT_COST_")) {
          fetchCostBudget(token)
            .then(setCostBudget)
            .catch(() => {
              /* leave the panel showing the previous snapshot */
            });
        }
        setNotice("Setting saved");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save setting");
      }
    },
    [],
  );

  const loadSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const token = await getToken();
      const { items } = await fetchAdminSources(token);
      setSources(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  // Lazy-load sources only when the tab opens. Avoids a 5K-row
  // discovered_sources scan on every console boot.
  useEffect(() => {
    if (isAdmin && activeTab === "sources" && sources.length === 0) {
      loadSources();
    }
  }, [isAdmin, activeTab, sources.length, loadSources]);

  const createSource = useCallback(
    async (body: AdminSourceCreateBody) => {
      const token = await getToken();
      const created = await createAdminSource(token, body);
      // Re-fetch so health stats land in one place rather than mixing
      // freshly-inserted (no stats yet) rows with stale cached values.
      await loadSources();
      setNotice(`Added source "${created.name}"`);
    },
    [loadSources],
  );

  const editSource = useCallback(
    async (sourceId: string, patch: AdminSourceUpdateBody) => {
      try {
        const token = await getToken();
        const updated = await updateAdminSource(token, sourceId, patch);
        setSources((prev) =>
          prev.map((row) =>
            row.id === sourceId ? { ...row, ...updated } : row,
          ),
        );
        setNotice("Source updated");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update source",
        );
      }
    },
    [],
  );

  const removeSource = useCallback(async (sourceId: string) => {
    try {
      const token = await getToken();
      await deleteAdminSource(token, sourceId);
      setSources((prev) => prev.filter((row) => row.id !== sourceId));
      setNotice("Source deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete source");
    }
  }, []);

  const applyPreset = useCallback(async (preset: DiscoveryPreset) => {
    try {
      const token = await getToken();
      const result = await applyDiscoveryPreset(token, preset);
      const refreshed = await fetchAdminSettings(token);
      setSettings(refreshed.items);
      setNotice(
        `Applied ${result.preset} preset to ${result.items.length} discovery settings`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply preset");
    }
  }, []);

  // Coverage data is fetched together so the tab renders both widgets in
  // one shot. Pillar window changes refetch only the pillar payload to
  // avoid re-counting workstream scans for a UI-only knob.
  const loadCoverage = useCallback(async (days: CoverageWindowDays) => {
    setCoverageLoading(true);
    const gen = ++coverageGenRef.current;
    try {
      const token = await getToken();
      const [pillars, workstreams] = await Promise.all([
        fetchPillarCoverage(token, days),
        fetchWorkstreamCoverage(token),
      ]);
      // Stale-overwrite guard: bail if the operator changed windows mid-flight.
      if (gen !== coverageGenRef.current) return;
      setPillarCoverage(pillars);
      setWorkstreamCoverage(workstreams.items);
    } catch (err) {
      if (gen !== coverageGenRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load coverage");
    } finally {
      // Always flip the attempted flag so a failed first load can't loop.
      // The `gen` check below is intentionally absent: the cleanup is per-
      // attempt, not per-window.
      setCoverageAttempted(true);
      setCoverageLoading(false);
    }
  }, []);

  const loadPillarOnly = useCallback(async (days: CoverageWindowDays) => {
    const gen = ++coverageGenRef.current;
    try {
      const token = await getToken();
      const pillars = await fetchPillarCoverage(token, days);
      if (gen !== coverageGenRef.current) return;
      setPillarCoverage(pillars);
    } catch (err) {
      if (gen !== coverageGenRef.current) return;
      setError(
        err instanceof Error ? err.message : "Failed to refresh pillar window",
      );
    }
  }, []);

  // Lazy-load coverage when the tab is first opened. Subsequent window
  // changes hit loadPillarOnly so we don't re-aggregate the WS table.
  // Gate on `coverageAttempted` (not `pillarCoverage === null`) so a
  // failed initial fetch doesn't keep re-firing this effect — otherwise
  // a 5xx upstream would put us in a tight retry loop.
  useEffect(() => {
    if (
      isAdmin &&
      activeTab === "coverage" &&
      !coverageAttempted &&
      !coverageLoading
    ) {
      loadCoverage(coverageDays);
    }
  }, [
    isAdmin,
    activeTab,
    coverageAttempted,
    coverageLoading,
    coverageDays,
    loadCoverage,
  ]);

  const changeCoverageWindow = useCallback(
    (days: CoverageWindowDays) => {
      setCoverageDays(days);
      // Refetch pillar payload only; WS freshness doesn't depend on the
      // pillar window.
      loadPillarOnly(days);
    },
    [loadPillarOnly],
  );

  const refreshCoverage = useCallback(
    () => loadCoverage(coverageDays),
    [coverageDays, loadCoverage],
  );

  const forceScanWorkstream = useCallback(async (workstreamId: string) => {
    try {
      const token = await getToken();
      const result = await adminForceWorkstreamScan(token, workstreamId);
      setNotice(`Scan ${result.scan_id.slice(0, 8)} queued`);
      // Refresh WS table so the new scans_30d count and (eventually)
      // last_scanned_at reflect the new run. Pillar data is unaffected.
      const ws = await fetchWorkstreamCoverage(token);
      setWorkstreamCoverage(ws.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to force scan");
    }
  }, []);

  const runAction = useCallback(
    async (action: "scan" | "velocity" | "quality" | "lens-backfill") => {
      try {
        const token = await getToken();
        const result = await triggerAdminAction(token, action);
        setNotice(String(result.message || result.status || "Action started"));
        setJobs(await fetchRecentJobs(token));
        setOverview(await fetchAdminOverview(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start action");
      }
    },
    [],
  );

  // Just update usageDays — the loadUsage effect picks up the change and
  // refetches once.
  const updateUsageWindow = useCallback((days: number) => {
    setUsageDays(days);
  }, []);

  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const token = await getToken();
      const { items } = await fetchAdminSchedules(token);
      setSchedules(items);
      setSchedulesLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedules");
    } finally {
      setSchedulesLoading(false);
    }
  }, []);

  // Lazy-load only when the tab opens. Schedule rows are tiny but the audit
  // log writes when listing should not happen on every console boot.
  useEffect(() => {
    if (isAdmin && activeTab === "schedules" && !schedulesLoaded) {
      loadSchedules();
    }
  }, [isAdmin, activeTab, schedulesLoaded, loadSchedules]);

  const loadLlmAuditEvents = useCallback(
    async (offset: number) => {
      const myGen = ++llmAuditGenRef.current;
      setLlmAuditLoading(true);
      try {
        const token = await getToken();
        const data = await fetchLlmAuditEvents(token, {
          ...llmAuditFilters,
          offset,
        });
        // Skip stale responses if a newer fetch has already started.
        if (llmAuditGenRef.current !== myGen) return;
        setLlmAuditEvents(data.items);
        setLlmAuditPage({ offset: data.offset, nextOffset: data.next_offset });
      } catch (err) {
        if (llmAuditGenRef.current !== myGen) return;
        setError(
          err instanceof Error ? err.message : "Failed to load LLM activity",
        );
      } finally {
        if (llmAuditGenRef.current === myGen) setLlmAuditLoading(false);
      }
    },
    [llmAuditFilters],
  );

  // Lazy-load when the tab opens or filters change. Resets to page 0.
  useEffect(() => {
    if (isAdmin && activeTab === "llm_activity") {
      loadLlmAuditEvents(0);
    }
  }, [isAdmin, activeTab, loadLlmAuditEvents]);

  const loadSafetyIncidents = useCallback(
    async (offset: number) => {
      const myGen = ++safetyGenRef.current;
      setSafetyLoading(true);
      try {
        const token = await getToken();
        const data = await fetchSafetyIncidents(token, {
          ...safetyFilters,
          offset,
        });
        if (safetyGenRef.current !== myGen) return;
        setSafetyData(data);
        setSafetyOffset(data.offset);
      } catch (err) {
        if (safetyGenRef.current !== myGen) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load safety incidents",
        );
      } finally {
        if (safetyGenRef.current === myGen) setSafetyLoading(false);
      }
    },
    [safetyFilters],
  );

  useEffect(() => {
    if (isAdmin && activeTab === "safety") {
      loadSafetyIncidents(0);
    }
  }, [isAdmin, activeTab, loadSafetyIncidents]);

  const handleSafetyDisposition = useCallback(
    async (incidentId: string, disposition: SafetyDisposition) => {
      try {
        const token = await getToken();
        await updateSafetyIncident(token, incidentId, { disposition });
        setNotice(`Marked incident as ${disposition.replace("_", " ")}`);
        loadSafetyIncidents(safetyOffset);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update incident",
        );
      }
    },
    [loadSafetyIncidents, safetyOffset],
  );

  const handleSafetyAbuseScan = useCallback(async () => {
    setSafetyAbuseScanRunning(true);
    try {
      const token = await getToken();
      const result = await runSafetyAbuseScan(token, 60);
      setNotice(
        `Abuse scan complete — ${result.findings.length} finding(s), ${result.inserted} new incident(s)`,
      );
      loadSafetyIncidents(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Abuse scan failed");
    } finally {
      setSafetyAbuseScanRunning(false);
    }
  }, [loadSafetyIncidents]);

  const openLlmAuditDetail = useCallback(async (eventId: string) => {
    // Track which event the user actually wants to see. If they close the
    // modal or click a different row before this request resolves, we drop
    // the stale response instead of reopening a dismissed modal.
    const myGen = ++llmAuditDetailGenRef.current;
    llmAuditSelectedRef.current = eventId;
    setLlmAuditDetailLoading(true);
    setLlmAuditDetail({ id: eventId } as LlmAuditEventDetail);
    setLlmAuditReplay(null);
    let token: string;
    try {
      token = await getToken();
      const detail = await fetchLlmAuditEvent(token, eventId);
      if (
        llmAuditDetailGenRef.current !== myGen ||
        llmAuditSelectedRef.current !== eventId
      ) {
        return;
      }
      setLlmAuditDetail(detail);
      // Replay must not gate detail rendering — a slow /replay would leave
      // the modal stuck on "Loading event…" while the (already-fetched)
      // payload is invisible. Kick the replay off in the background and
      // flip the detail-loading flag now.
      setLlmAuditDetailLoading(false);
      if (detail.conversation_id) {
        const convId = detail.conversation_id;
        setLlmAuditReplayLoading(true);
        void (async () => {
          try {
            const replay = await fetchLlmAuditReplay(token, convId);
            if (
              llmAuditDetailGenRef.current === myGen &&
              llmAuditSelectedRef.current === eventId
            ) {
              setLlmAuditReplay(replay);
            }
          } catch (replayErr) {
            if (
              llmAuditDetailGenRef.current === myGen &&
              llmAuditSelectedRef.current === eventId
            ) {
              setError(
                replayErr instanceof Error
                  ? replayErr.message
                  : "Failed to load replay",
              );
            }
          } finally {
            if (
              llmAuditDetailGenRef.current === myGen &&
              llmAuditSelectedRef.current === eventId
            ) {
              setLlmAuditReplayLoading(false);
            }
          }
        })();
      }
    } catch (err) {
      if (
        llmAuditDetailGenRef.current !== myGen ||
        llmAuditSelectedRef.current !== eventId
      ) {
        return;
      }
      setLlmAuditDetail(null);
      setError(
        err instanceof Error ? err.message : "Failed to load event detail",
      );
      setLlmAuditDetailLoading(false);
    }
  }, []);

  const createSchedule = useCallback(
    async (body: AdminScheduleCreateBody) => {
      const token = await getToken();
      const created = await createAdminSchedule(token, body);
      // Re-fetch instead of splicing so the order matches the backend's
      // ORDER BY created_at ASC.
      await loadSchedules();
      setNotice(`Created schedule "${created.name}"`);
    },
    [loadSchedules],
  );

  const editSchedule = useCallback(
    async (scheduleId: string, patch: AdminScheduleUpdateBody) => {
      try {
        const token = await getToken();
        const updated = await updateAdminSchedule(token, scheduleId, patch);
        setSchedules((prev) =>
          prev.map((row) => (row.id === scheduleId ? updated : row)),
        );
        setNotice(`Schedule "${updated.name}" updated`);
      } catch (err) {
        // Surface the error in the console banner *and* rethrow so the
        // caller (typically the edit modal) sees the rejection and can
        // keep itself open with an inline error. Resolving the promise
        // here would tell the modal the save succeeded.
        setError(
          err instanceof Error ? err.message : "Failed to update schedule",
        );
        throw err;
      }
    },
    [],
  );

  const removeSchedule = useCallback(async (scheduleId: string) => {
    try {
      const token = await getToken();
      await deleteAdminSchedule(token, scheduleId);
      setSchedules((prev) => prev.filter((row) => row.id !== scheduleId));
      setNotice("Schedule deleted");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete schedule",
      );
    }
  }, []);

  const runRecoveryAction = useCallback(
    async (action: "recover" | "reprocess" | "recover-analyzed") => {
      try {
        const token = await getToken();
        const trigger =
          action === "recover"
            ? triggerDiscoveryRecover
            : action === "reprocess"
              ? triggerDiscoveryReprocess
              : triggerDiscoveryRecoverAnalyzed;
        const result = await trigger(token);
        const summary =
          (result && (result.message || result.status)) || "Action started";
        setNotice(`${action}: ${String(summary)}`);
        setError(null);
        setJobs(await fetchRecentJobs(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Recovery action failed");
      }
    },
    [],
  );

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="text-lg font-semibold">Admin access required</h1>
              <p className="mt-1 text-sm">
                Your account does not have permission to open the administration
                console.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-blue/10 p-2 text-brand-blue">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Administration
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Users, operations, model settings, chat limits, and usage
                telemetry.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={refreshAll}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh console
        </button>
      </div>

      {(error || notice) && (
        <div
          className={cn(
            "mb-4 rounded-lg border p-3 text-sm",
            error
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{error || notice}</span>
            <button
              onClick={() => {
                setError(null);
                setNotice(null);
              }}
              className="font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        <nav
          className="-mb-px flex min-w-max gap-4"
          aria-label="Admin sections"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
                  active
                    ? "border-brand-blue text-brand-blue"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {loading && !overview ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
        </div>
      ) : (
        <>
          {activeTab === "overview" && <OverviewTab overview={overview} />}
          {activeTab === "users" && (
            <UsersTab
              users={users}
              onRefresh={refreshUsers}
              onSave={saveUser}
            />
          )}
          {activeTab === "operations" && (
            <OperationsTab
              jobs={jobs}
              onAction={runAction}
              onInspectRun={(id) => setInspectRunId(id)}
            />
          )}
          {activeTab === "settings" && (
            <SettingsTab
              settings={settings}
              onSave={saveSetting}
              onApplyPreset={applyPreset}
            />
          )}
          {activeTab === "sources" && (
            <SourcesTab
              sources={sources}
              loading={sourcesLoading}
              onRefresh={loadSources}
              onCreate={createSource}
              onUpdate={editSource}
              onDelete={removeSource}
            />
          )}
          {activeTab === "schedules" && (
            <SchedulesTab
              schedules={schedules}
              loading={schedulesLoading}
              demoFreezeSetting={
                settings.find((s) => s.key === "FORESIGHT_DEMO_FREEZE") ?? null
              }
              onRefresh={loadSchedules}
              onCreate={createSchedule}
              onUpdate={editSchedule}
              onDelete={removeSchedule}
              onToggleDemoFreeze={async (next: boolean) => {
                const freezeSetting = settings.find(
                  (s) => s.key === "FORESIGHT_DEMO_FREEZE",
                );
                if (!freezeSetting) return;
                await saveSetting(freezeSetting, next);
              }}
            />
          )}
          {activeTab === "coverage" && (
            <CoverageTab
              pillarData={pillarCoverage}
              workstreams={workstreamCoverage}
              loading={coverageLoading}
              windowDays={coverageDays}
              onWindowChange={changeCoverageWindow}
              onRefresh={refreshCoverage}
              onForceScan={forceScanWorkstream}
            />
          )}
          {activeTab === "usage" && (
            <UsageTab
              usage={usage}
              recentUsage={recentUsage}
              days={usageDays}
              onDaysChange={updateUsageWindow}
              budget={costBudget}
              onResetGuardrail={handleResetCostGuardrail}
              resetting={costResetting}
            />
          )}
          {activeTab === "audit" && (
            <AuditLogTab
              entries={auditEntries}
              filters={auditFilters}
              onFilterChange={(next) =>
                setAuditFilters((prev) => ({ ...prev, ...next }))
              }
              onRefresh={loadAudit}
            />
          )}
          {activeTab === "llm_activity" && (
            <LlmActivityTab
              events={llmAuditEvents}
              loading={llmAuditLoading}
              filters={llmAuditFilters}
              page={llmAuditPage}
              onFilterChange={(next) =>
                setLlmAuditFilters((prev) => ({ ...prev, ...next }))
              }
              onPageChange={(offset) => loadLlmAuditEvents(offset)}
              onRefresh={() => loadLlmAuditEvents(llmAuditPage.offset)}
              onSelect={openLlmAuditDetail}
              onExport={() => setLlmAuditExportOpen(true)}
            />
          )}
          {activeTab === "safety" && (
            <SafetyTab
              data={safetyData}
              loading={safetyLoading}
              filters={safetyFilters}
              offset={safetyOffset}
              expandedId={safetyExpandedId}
              abuseScanRunning={safetyAbuseScanRunning}
              onFilterChange={(next) =>
                setSafetyFilters((prev) => ({ ...prev, ...next }))
              }
              onExpandToggle={(id) =>
                setSafetyExpandedId((prev) => (prev === id ? null : id))
              }
              onPageChange={(offset) => loadSafetyIncidents(offset)}
              onRefresh={() => loadSafetyIncidents(safetyOffset)}
              onDisposition={handleSafetyDisposition}
              onRunAbuseScan={handleSafetyAbuseScan}
            />
          )}
        </>
      )}

      {llmAuditExportOpen && (
        <LlmAuditExportModal
          filters={llmAuditFilters}
          exporting={llmAuditExporting}
          onClose={() => setLlmAuditExportOpen(false)}
          onDownload={async (format) => {
            setLlmAuditExporting(true);
            try {
              const token = await getToken();
              const exportFilters: LlmAuditExportFilters = {
                operation: llmAuditFilters.operation,
                model: llmAuditFilters.model,
                status: llmAuditFilters.status,
                audited_only: llmAuditFilters.audited_only,
                from: llmAuditFilters.from,
                to: llmAuditFilters.to,
                min_cost: llmAuditFilters.min_cost,
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
              setLlmAuditExportOpen(false);
              setNotice(`Exported ${filename}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Export failed");
            } finally {
              setLlmAuditExporting(false);
            }
          }}
        />
      )}

      {llmAuditDetail && (
        <LlmAuditDetailModal
          detail={llmAuditDetail}
          loading={llmAuditDetailLoading}
          replay={llmAuditReplay}
          replayLoading={llmAuditReplayLoading}
          onClose={() => {
            llmAuditSelectedRef.current = null;
            setLlmAuditDetail(null);
            setLlmAuditReplay(null);
          }}
        />
      )}

      {inspectRunId && (
        <RunDetailModal
          runId={inspectRunId}
          onClose={() => setInspectRunId(null)}
          onRecoveryAction={runRecoveryAction}
        />
      )}
    </div>
  );
};

export default AdminConsole;
