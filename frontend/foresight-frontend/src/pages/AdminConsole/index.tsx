/**
 * AdminConsole — slim composer that owns top-level UI state (active tab,
 * error/notice banner, modal targets) and delegates per-feature data and
 * actions to focused hooks in `./hooks/*`. Tab-specific UI lives in
 * `./tabs/*`; the heavy modals live in `./modals/*`.
 *
 * @module pages/AdminConsole
 */

import React, { useCallback, useState } from "react";
import { Loader2, RefreshCw, Shield } from "lucide-react";

import {
  type AdminAction,
  fetchAdminOverview,
  fetchRecentJobs,
  triggerAdminAction,
  triggerDiscoveryRecover,
  triggerDiscoveryRecoverAnalyzed,
  triggerDiscoveryReprocess,
} from "../../lib/admin-api";
import { useAuthContext } from "../../hooks/useAuthContext";
import { cn } from "../../lib/utils";

import { getToken, tabs, type AdminTab } from "./helpers";
import { useAuditLog } from "./hooks/useAuditLog";
import { useBootstrap } from "./hooks/useBootstrap";
import { useCoverage } from "./hooks/useCoverage";
import { useLlmAudit } from "./hooks/useLlmAudit";
import { useSafety } from "./hooks/useSafety";
import { useSchedules } from "./hooks/useSchedules";
import { useSources } from "./hooks/useSources";
import { useUsage } from "./hooks/useUsage";
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inspectRunId, setInspectRunId] = useState<string | null>(null);

  const isAdmin = profile?.role === "admin" || profile?.role === "service_role";

  // Stable callback wrappers so each hook gets a non-changing identity.
  const onError = useCallback((message: string) => setError(message), []);
  const onNotice = useCallback((message: string) => setNotice(message), []);

  // useUsage owns the cost-budget snapshot. useBootstrap signals back via
  // `onCostSettingChanged` whenever a FORESIGHT_COST_* setting is saved so
  // the Usage panel re-pulls without forcing the operator to refresh.
  const usage = useUsage({ isAdmin, onError, onNotice });
  const onCostSettingChanged = useCallback(() => {
    void usage.refreshBudget();
  }, [usage]);

  const bootstrap = useBootstrap({
    isAdmin,
    onError,
    onNotice,
    onCostSettingChanged,
  });
  const audit = useAuditLog({ isAdmin, onError });
  const sources = useSources({ isAdmin, activeTab, onError, onNotice });
  const schedules = useSchedules({ isAdmin, activeTab, onError, onNotice });
  const coverage = useCoverage({ isAdmin, activeTab, onError, onNotice });
  const llmAudit = useLlmAudit({ isAdmin, activeTab, onError, onNotice });
  const safety = useSafety({ isAdmin, activeTab, onError, onNotice });

  // Refresh-console button: refetch the non-windowed bootstrap payloads and
  // the two windowed sections (usage / audit) that are always loaded.
  const refreshAll = useCallback(() => {
    bootstrap.load();
    usage.load();
    audit.load();
  }, [audit, bootstrap, usage]);

  // Operations triggers — these aren't tied to a feature hook because they
  // mutate two bootstrap slices (jobs + overview) at once.
  const runAction = useCallback(
    async (action: AdminAction) => {
      try {
        const token = await getToken();
        const result = await triggerAdminAction(token, action);
        setNotice(String(result.message || result.status || "Action started"));
        bootstrap.setJobs(await fetchRecentJobs(token));
        bootstrap.setOverview(await fetchAdminOverview(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start action");
      }
    },
    [bootstrap],
  );

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
        bootstrap.setJobs(await fetchRecentJobs(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Recovery action failed");
      }
    },
    [bootstrap],
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

  const demoFreezeSetting =
    bootstrap.settings.find((s) => s.key === "FORESIGHT_DEMO_FREEZE") ?? null;

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
          {bootstrap.loading ? (
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

      {bootstrap.loading && !bootstrap.overview ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <OverviewTab overview={bootstrap.overview} />
          )}
          {activeTab === "users" && (
            <UsersTab
              users={bootstrap.users}
              onRefresh={bootstrap.refreshUsers}
              onSave={bootstrap.saveUser}
            />
          )}
          {activeTab === "operations" && (
            <OperationsTab
              jobs={bootstrap.jobs}
              onAction={runAction}
              onInspectRun={(id) => setInspectRunId(id)}
            />
          )}
          {activeTab === "settings" && (
            <SettingsTab
              settings={bootstrap.settings}
              onSave={bootstrap.saveSetting}
              onApplyPreset={bootstrap.applyPreset}
            />
          )}
          {activeTab === "sources" && (
            <SourcesTab
              sources={sources.sources}
              loading={sources.loading}
              onRefresh={sources.load}
              onCreate={sources.create}
              onUpdate={sources.edit}
              onDelete={sources.remove}
            />
          )}
          {activeTab === "schedules" && (
            <SchedulesTab
              schedules={schedules.schedules}
              loading={schedules.loading}
              demoFreezeSetting={demoFreezeSetting}
              onRefresh={schedules.load}
              onCreate={schedules.create}
              onUpdate={schedules.edit}
              onDelete={schedules.remove}
              onToggleDemoFreeze={async (next: boolean) => {
                if (!demoFreezeSetting) return;
                await bootstrap.saveSetting(demoFreezeSetting, next);
              }}
            />
          )}
          {activeTab === "coverage" && (
            <CoverageTab
              pillarData={coverage.pillarCoverage}
              workstreams={coverage.workstreamCoverage}
              gaps={coverage.gaps}
              loading={coverage.loading}
              windowDays={coverage.days}
              mode={coverage.mode}
              onWindowChange={coverage.changeWindow}
              onModeChange={coverage.changeMode}
              onRefresh={coverage.refresh}
              onForceScan={coverage.forceScan}
              onBalanceNow={coverage.balanceNow}
              balancing={coverage.balancing}
            />
          )}
          {activeTab === "usage" && (
            <UsageTab
              usage={usage.usage}
              recentUsage={usage.recent}
              days={usage.days}
              onDaysChange={usage.updateWindow}
              budget={usage.budget}
              onResetGuardrail={usage.resetGuardrail}
              resetting={usage.resetting}
            />
          )}
          {activeTab === "audit" && (
            <AuditLogTab
              entries={audit.entries}
              filters={audit.filters}
              onFilterChange={audit.updateFilters}
              onRefresh={audit.load}
            />
          )}
          {activeTab === "llm_activity" && (
            <LlmActivityTab
              events={llmAudit.events}
              loading={llmAudit.loading}
              filters={llmAudit.filters}
              page={llmAudit.page}
              onFilterChange={llmAudit.updateFilters}
              onPageChange={(offset) => llmAudit.loadEvents(offset)}
              onRefresh={() => llmAudit.loadEvents(llmAudit.page.offset)}
              onSelect={llmAudit.openDetail}
              onExport={llmAudit.openExport}
            />
          )}
          {activeTab === "safety" && (
            <SafetyTab
              data={safety.data}
              loading={safety.loading}
              filters={safety.filters}
              offset={safety.offset}
              expandedId={safety.expandedId}
              abuseScanRunning={safety.abuseScanRunning}
              onFilterChange={safety.updateFilters}
              onExpandToggle={safety.toggleExpanded}
              onPageChange={(offset) => safety.load(offset)}
              onRefresh={() => safety.load(safety.offset)}
              onDisposition={safety.disposition}
              onRunAbuseScan={safety.runAbuseScan}
            />
          )}
        </>
      )}

      {llmAudit.exportOpen && (
        <LlmAuditExportModal
          filters={llmAudit.filters}
          exporting={llmAudit.exporting}
          onClose={llmAudit.closeExport}
          onDownload={llmAudit.downloadExport}
        />
      )}

      {llmAudit.detail && (
        <LlmAuditDetailModal
          detail={llmAudit.detail}
          loading={llmAudit.detailLoading}
          replay={llmAudit.replay}
          replayLoading={llmAudit.replayLoading}
          onClose={llmAudit.closeDetail}
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
