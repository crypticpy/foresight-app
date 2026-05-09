import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Database,
  Gauge,
  History,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Shield,
  SlidersHorizontal,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "../App";
import { useAuthContext } from "../hooks/useAuthContext";
import { cn } from "../lib/utils";
import {
  adminForceWorkstreamScan,
  applyDiscoveryPreset,
  createAdminSource,
  deleteAdminSource,
  fetchAdminAuditLog,
  fetchAdminOverview,
  fetchAdminSettings,
  fetchAdminSources,
  fetchAdminUsers,
  fetchPillarCoverage,
  fetchRecentJobs,
  fetchRecentUsage,
  fetchUsageSummary,
  fetchWorkstreamCoverage,
  triggerAdminAction,
  updateAdminSetting,
  updateAdminSource,
  updateAdminUser,
  type AdminAuditEntry,
  type AdminOverview,
  type AdminSetting,
  type AdminSource,
  type AdminSourceCreateBody,
  type AdminSourceUpdateBody,
  type AdminUser,
  type CoverageWindowDays,
  type DiscoveryPreset,
  type PillarCoverageResponse,
  type RecentJobsResponse,
  type SourceCategory,
  type UsageEvent,
  type UsageSummary,
  type WorkstreamCoverageItem,
} from "../lib/admin-api";

type AdminTab =
  | "overview"
  | "users"
  | "operations"
  | "settings"
  | "sources"
  | "coverage"
  | "usage"
  | "audit";

const tabs: Array<{ id: AdminTab; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "operations", label: "Operations", icon: Activity },
  { id: "settings", label: "Models & Chat", icon: SlidersHorizontal },
  { id: "sources", label: "Sources", icon: Rss },
  { id: "coverage", label: "Coverage", icon: Gauge },
  { id: "usage", label: "Usage", icon: Database },
  { id: "audit", label: "Audit log", icon: History },
];

async function getToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return session.access_token;
}

function formatDate(value?: unknown): string {
  if (!value || typeof value !== "string") return "n/a";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatMoney(value?: number): string {
  return `$${(value || 0).toFixed(4)}`;
}

function StatusPill({ status }: { status?: unknown }) {
  const text = String(status || "unknown");
  const className =
    text === "completed" || text === "healthy" || text === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
      : text === "queued" ||
          text === "running" ||
          text === "processing" ||
          text === "started"
        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800"
        : text === "failed" || text === "error"
          ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
          : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        className,
      )}
    >
      {text}
    </span>
  );
}

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-dark-surface">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
            {value}
          </div>
          {subtext && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {subtext}
            </p>
          )}
        </div>
        <div className="rounded-md bg-brand-blue/10 p-2 text-brand-blue">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function OverviewTab({ overview }: { overview: AdminOverview | null }) {
  if (!overview) return null;
  const failedTasks = overview.research_tasks.by_status.failed || 0;
  const activeTasks =
    (overview.research_tasks.by_status.queued || 0) +
    (overview.research_tasks.by_status.processing || 0) +
    (overview.research_tasks.by_status.running || 0);

  return (
    <div>
      <SectionHeader
        title="System Overview"
        description="Operational snapshot across users, signals, background jobs, and runtime mode."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Users"
          value={overview.users.total}
          subtext={`${overview.users.by_role.admin || 0} admins, ${overview.users.by_account_type.guest || 0} guests`}
          icon={Users}
        />
        <MetricCard
          label="Signals"
          value={overview.cards.total}
          subtext={`${overview.cards.new_last_7d} created in the last 7 days`}
          icon={Database}
        />
        <MetricCard
          label="Workstreams"
          value={overview.workstreams.total}
          subtext={`${overview.workstreams.org_owned} org-owned, ${overview.workstreams.auto_scan} auto-scan`}
          icon={Activity}
        />
        <MetricCard
          label="Research Queue"
          value={activeTasks}
          subtext={`${failedTasks} failed in recent sample`}
          icon={failedTasks > 0 ? AlertTriangle : CheckCircle2}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface">
          <h3 className="font-medium text-gray-900 dark:text-white">Runtime</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {Object.entries(overview.runtime).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4"
              >
                <dt className="text-gray-500 dark:text-gray-400">{key}</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface">
          <h3 className="font-medium text-gray-900 dark:text-white">
            Research Task Status
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(overview.research_tasks.by_status).map(
              ([status, count]) => (
                <span key={status} className="text-sm">
                  <StatusPill status={status} />{" "}
                  <span className="text-gray-700 dark:text-gray-300">
                    {count}
                  </span>
                </span>
              ),
            )}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface">
          <h3 className="font-medium text-gray-900 dark:text-white">
            Discovery and Scans
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">
                Discovery runs sampled
              </dt>
              <dd className="font-medium">
                {overview.discovery_runs.recent_count}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">
                Scans sampled
              </dt>
              <dd className="font-medium">
                {overview.workstream_scans.recent_count}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function UsersTab({
  users,
  onRefresh,
  onSave,
}: {
  users: AdminUser[];
  onRefresh: (filters?: {
    search?: string;
    account_type?: string;
    role?: string;
  }) => void;
  onSave: (user: AdminUser, patch: Partial<AdminUser>) => void;
}) {
  const [search, setSearch] = useState("");
  const [accountType, setAccountType] = useState("");
  const [role, setRole] = useState("");

  const applyFilters = () =>
    onRefresh({ search, account_type: accountType, role });

  return (
    <div>
      <SectionHeader
        title="Users"
        description="Administer pilot roles and account type access."
        action={
          <button
            onClick={applyFilters}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-dark-surface md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyFilters();
            }}
            placeholder="Search email or name"
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
          />
        </div>
        <select
          value={accountType}
          onChange={(event) => setAccountType(event.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        >
          <option value="">All account types</option>
          <option value="paid">Paid</option>
          <option value="guest">Guest</option>
        </select>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        >
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
          <option value="service_role">Service role</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-dark-surface-elevated">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  User
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Role
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Account
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {user.display_name || user.email}
                    </div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role || "user"}
                      onChange={(event) =>
                        onSave(user, { role: event.target.value })
                      }
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="service_role">Service role</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.account_type || "paid"}
                      onChange={(event) =>
                        onSave(user, {
                          account_type: event.target
                            .value as AdminUser["account_type"],
                        })
                      }
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
                    >
                      <option value="paid">Paid</option>
                      <option value="guest">Guest</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(user.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OperationsTab({
  jobs,
  onAction,
}: {
  jobs: RecentJobsResponse | null;
  onAction: (action: "scan" | "velocity" | "quality" | "lens-backfill") => void;
}) {
  const actions = [
    {
      id: "scan" as const,
      title: "Manual update scan",
      description: "Queue quick update tasks for active signals stale for 24h.",
    },
    {
      id: "velocity" as const,
      title: "Velocity recalculation",
      description: "Recalculate trend velocity for all active signals.",
    },
    {
      id: "quality" as const,
      title: "Quality recalculation",
      description: "Recompute signal quality scores across all cards.",
    },
    {
      id: "lens-backfill" as const,
      title: "Lens classification backfill",
      description: "Backfill lens metadata for up to 100 cards.",
    },
  ];

  const renderRows = (rows: Array<Record<string, unknown>>, title: string) => (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.slice(0, 12).map((row, index) => (
              <tr key={String(row.id || index)}>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {String(
                      row.task_type || row.triggered_by || row.id || "Job",
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(row.created_at || row.started_at)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <StatusPill status={row.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500">
                  No recent jobs
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader
        title="Operations"
        description="Trigger controlled background jobs and inspect recent task state."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            className="rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-blue hover:bg-brand-blue/5 dark:border-gray-700 dark:bg-dark-surface"
          >
            <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <Play className="h-4 w-4 text-brand-blue" />
              {action.title}
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {action.description}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {renderRows(jobs?.research_tasks || [], "Research tasks")}
        {renderRows(jobs?.discovery_runs || [], "Discovery runs")}
        {renderRows(jobs?.workstream_scans || [], "Workstream scans")}
      </div>
    </div>
  );
}

function SettingsTab({
  settings,
  onSave,
  onApplyPreset,
}: {
  settings: AdminSetting[];
  onSave: (setting: AdminSetting, value: unknown) => void;
  onApplyPreset: (preset: DiscoveryPreset) => Promise<void>;
}) {
  const groups = useMemo(() => {
    return settings.reduce<Record<string, AdminSetting[]>>((acc, setting) => {
      const list = acc[setting.group_name] ?? [];
      list.push(setting);
      acc[setting.group_name] = list;
      return acc;
    }, {});
  }, [settings]);

  return (
    <div>
      <SectionHeader
        title="Models & Chat Settings"
        description="Persist model, quota, research, runtime, and feature configuration overrides."
      />
      <div className="space-y-5">
        {Object.entries(groups).map(([group, items]) => (
          <div
            key={group}
            className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface"
          >
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h3 className="font-semibold capitalize text-gray-900 dark:text-white">
                {group}
              </h3>
            </div>
            {group === "discovery" && (
              <DiscoveryPresetRow onApply={onApplyPreset} />
            )}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((setting) => (
                <SettingRow
                  key={setting.key}
                  setting={setting}
                  onSave={onSave}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DISCOVERY_PRESET_DESCRIPTIONS: Record<DiscoveryPreset, string> = {
  conservative:
    "Tight caps, strict thresholds. Lower spend, fewer false-positive cards.",
  balanced: "Default values used in code. Resets any drift to baseline.",
  aggressive:
    "Higher caps, looser dedup. More coverage at higher LLM cost; more enrichment + new cards.",
};

function DiscoveryPresetRow({
  onApply,
}: {
  onApply: (preset: DiscoveryPreset) => Promise<void>;
}) {
  const [pending, setPending] = useState<DiscoveryPreset | null>(null);

  const handleClick = async (preset: DiscoveryPreset) => {
    if (pending) return;
    const message =
      `Apply the "${preset}" preset? This will overwrite all eight discovery ` +
      `settings below and write one audit entry per knob.\n\n` +
      DISCOVERY_PRESET_DESCRIPTIONS[preset];
    if (!window.confirm(message)) return;
    setPending(preset);
    try {
      await onApply(preset);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-dark-surface-deep/40">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[16rem]">
          <p className="font-medium text-gray-900 dark:text-white">
            Quick presets
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Bulk-apply all eight discovery knobs. Takes effect on the next run.
          </p>
        </div>
        {(["conservative", "balanced", "aggressive"] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={pending !== null}
            onClick={() => handleClick(preset)}
            className={cn(
              "inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors",
              "border-gray-300 bg-white text-gray-700 hover:border-brand-blue hover:text-brand-blue",
              "dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-200 dark:hover:border-brand-blue dark:hover:text-brand-blue",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {pending === preset && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingRow({
  setting,
  onSave,
}: {
  setting: AdminSetting;
  onSave: (setting: AdminSetting, value: unknown) => void;
}) {
  const [value, setValue] = useState(setting.value);
  useEffect(() => setValue(setting.value), [setting.value]);

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[1fr_18rem_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-gray-900 dark:text-white">
            {setting.label}
          </p>
          {setting.has_override && (
            <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue">
              override
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {setting.description}
        </p>
        <p className="mt-1 text-xs text-gray-400">Key: {setting.key}</p>
      </div>
      <div>
        {setting.value_type === "boolean" ? (
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => setValue(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-blue"
            />
            {value ? "Enabled" : "Disabled"}
          </label>
        ) : (
          <input
            type={setting.value_type === "number" ? "number" : "text"}
            value={value == null ? "" : String(value)}
            onChange={(event) => {
              if (setting.value_type !== "number") {
                setValue(event.target.value);
                return;
              }
              const raw = event.target.value;
              if (raw === "") {
                setValue(null);
                return;
              }
              // Reject NaN / partial inputs ("-", "1e", ".") so they don't
              // get serialized as JSON null and silently clear the setting.
              const parsed = Number(raw);
              if (Number.isFinite(parsed)) setValue(parsed);
            }}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
          />
        )}
      </div>
      <button
        onClick={() => onSave(setting, value)}
        className="inline-flex items-center justify-center rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark-blue"
      >
        Save
      </button>
    </div>
  );
}

function UsageTab({
  usage,
  recentUsage,
  days,
  onDaysChange,
}: {
  usage: UsageSummary | null;
  recentUsage: UsageEvent[];
  days: number;
  onDaysChange: (days: number) => void;
}) {
  return (
    <div>
      <SectionHeader
        title="Usage"
        description="Monitor model and external API consumption for the selected window."
        action={
          <select
            value={days}
            onChange={(event) => onDaysChange(Number(event.target.value))}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      />
      {usage && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard
              label="LLM Calls"
              value={usage.llm_totals.calls}
              subtext={`${usage.llm_totals.total_tokens.toLocaleString()} tokens`}
              icon={Bot}
            />
            <MetricCard
              label="LLM Cost"
              value={formatMoney(usage.llm_totals.estimated_cost_usd)}
              subtext={`${usage.llm_totals.cached_input_tokens.toLocaleString()} cached input tokens`}
              icon={BarChart3}
            />
            <MetricCard
              label="External APIs"
              value={usage.external_api_totals.calls}
              subtext={formatMoney(
                usage.external_api_totals.estimated_cost_usd,
              )}
              icon={Database}
            />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BreakdownTable title="By Model" rows={usage.llm_by_model} />
            <BreakdownTable
              title="By Operation"
              rows={usage.llm_by_operation}
            />
          </div>
        </>
      )}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="font-medium text-gray-900 dark:text-white">
            Recent LLM Events
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {recentUsage.map((event, index) => (
                <tr key={event.id || index}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {event.operation || "unknown"}
                    </div>
                    <div className="text-xs text-gray-500">{event.model}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {Number(event.total_tokens || 0).toLocaleString()} tokens
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {formatMoney(Number(event.estimated_cost_usd || 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {formatDate(event.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AuditLogTab({
  entries,
  filters,
  onFilterChange,
  onRefresh,
}: {
  entries: AdminAuditEntry[];
  filters: { target_type?: "user" | "setting" | ""; sinceDays: number };
  onFilterChange: (
    next: Partial<{ target_type: "user" | "setting" | ""; sinceDays: number }>,
  ) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div>
      <SectionHeader
        title="Audit log"
        description="Every admin user / setting mutation is recorded here. Append-only."
        action={
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-dark-surface md:grid-cols-3">
        <select
          value={filters.target_type ?? ""}
          onChange={(event) =>
            onFilterChange({
              target_type: event.target.value as "user" | "setting" | "",
            })
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        >
          <option value="">All targets</option>
          <option value="user">User changes</option>
          <option value="setting">Setting changes</option>
        </select>
        <select
          value={filters.sinceDays}
          onChange={(event) =>
            onFilterChange({ sinceDays: Number(event.target.value) })
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        >
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={0}>All time</option>
        </select>
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
                  Actor
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Action
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Target
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Diff
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {entries.map((entry) => {
                const open = Boolean(expanded[entry.id]);
                return (
                  <tr key={entry.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {formatDate(entry.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {entry.actor_email || entry.actor_id || "unknown"}
                      </div>
                      {entry.request_ip && (
                        <div className="text-xs text-gray-500">
                          {entry.request_ip}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                      {entry.action}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                      <div className="text-xs uppercase tracking-wide text-gray-400">
                        {entry.target_type}
                      </div>
                      <div className="font-mono text-xs">{entry.target_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggle(entry.id)}
                        className="text-xs font-medium text-brand-blue hover:underline"
                      >
                        {open ? "Hide" : "Show"} diff
                      </button>
                      {open && (
                        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <pre className="max-h-40 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-dark-surface-elevated dark:text-gray-200">
                            <span className="text-gray-400">before</span>
                            {"\n"}
                            {JSON.stringify(entry.before, null, 2)}
                          </pre>
                          <pre className="max-h-40 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-dark-surface-elevated dark:text-gray-200">
                            <span className="text-gray-400">after</span>
                            {"\n"}
                            {JSON.stringify(entry.after, null, 2)}
                          </pre>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    No audit entries match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: Record<string, Record<string, number>>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
      </div>
      <table className="min-w-full text-sm">
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {Object.entries(rows).map(([name, values]) => (
            <tr key={name}>
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                {name}
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {Number(values.calls || 0).toLocaleString()} calls
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {formatMoney(values.estimated_cost_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources tab — catalog of discovery feeds + per-source health (last 7d).
// v1: only RSS rows are read by the discovery pipeline; other categories
// are display-only with a badge. Source: backend/app/routers/admin_discovery.py.
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<SourceCategory, string> = {
  rss: "RSS / Atom feeds",
  news: "News outlets",
  academic: "Academic / arXiv",
  government: "Government (.gov)",
  tech_blog: "Tech blogs",
  web_search: "Web search templates",
};

// Categories whose fetcher actually reads from the registry today. Other
// categories display the rows but the pipeline still uses its hardcoded
// query lists (PR A2 will wire them up).
const LIVE_CATEGORIES: SourceCategory[] = ["rss"];

function SourcesTab({
  sources,
  loading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}: {
  sources: AdminSource[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onCreate: (body: AdminSourceCreateBody) => Promise<void>;
  onUpdate: (id: string, patch: AdminSourceUpdateBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);

  const groups = useMemo(() => {
    const buckets: Record<SourceCategory, AdminSource[]> = {
      rss: [],
      news: [],
      academic: [],
      government: [],
      tech_blog: [],
      web_search: [],
    };
    for (const source of sources) {
      buckets[source.category].push(source);
    }
    return buckets;
  }, [sources]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SectionHeader
          title="Discovery sources"
          description="The catalog of feeds and queries the pipeline scans. Toggle, weight, and edit any row; the next discovery run picks up the change."
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue/90"
          >
            <Plus className="h-4 w-4" />
            Add RSS source
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {(Object.keys(CATEGORY_LABELS) as SourceCategory[]).map((category) => {
          const items = groups[category];
          if (items.length === 0 && !LIVE_CATEGORIES.includes(category)) {
            return null;
          }
          const live = LIVE_CATEGORIES.includes(category);
          return (
            <SourceCategoryGroup
              key={category}
              category={category}
              live={live}
              items={items}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          );
        })}
      </div>

      {showAdd && (
        <AddSourceModal
          onClose={() => setShowAdd(false)}
          onCreate={async (body) => {
            await onCreate(body);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function SourceCategoryGroup({
  category,
  live,
  items,
  onUpdate,
  onDelete,
}: {
  category: SourceCategory;
  live: boolean;
  items: AdminSource[];
  onUpdate: (id: string, patch: AdminSourceUpdateBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {CATEGORY_LABELS[category]}
          </h3>
          {live ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              Live
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Display only
            </span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {items.length} {items.length === 1 ? "source" : "sources"}
          </span>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
          No sources registered for this category.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-dark-surface-deep/40 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">URL</th>
                <th className="px-4 py-2 text-center">Enabled</th>
                <th className="px-4 py-2 text-right">Weight</th>
                <th className="px-4 py-2 text-right">Items 7d</th>
                <th className="px-4 py-2 text-right">Accept rate</th>
                <th className="px-4 py-2 text-right">Last seen</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SourceRow({
  source,
  onUpdate,
  onDelete,
}: {
  source: AdminSource;
  onUpdate: (id: string, patch: AdminSourceUpdateBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [weightDraft, setWeightDraft] = useState(String(source.weight));

  const acceptRate =
    source.accept_rate_7d !== null
      ? `${Math.round(source.accept_rate_7d * 100)}%`
      : "—";

  const handleToggle = async () => {
    setPending(true);
    try {
      await onUpdate(source.id, { enabled: !source.enabled });
    } finally {
      setPending(false);
    }
  };

  const handleWeightCommit = async () => {
    const next = Number(weightDraft);
    if (Number.isNaN(next) || next < 0 || next > 10) {
      setWeightDraft(String(source.weight));
      return;
    }
    if (next === source.weight) return;
    setPending(true);
    try {
      await onUpdate(source.id, { weight: next });
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete source "${source.name}"? This cannot be undone — the next discovery run will skip it.`,
      )
    ) {
      return;
    }
    setPending(true);
    try {
      await onDelete(source.id);
    } finally {
      setPending(false);
    }
  };

  return (
    <tr
      className={cn(
        "text-sm",
        !source.enabled && "opacity-60",
        pending && "animate-pulse",
      )}
    >
      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
        {source.name}
        {source.notes && (
          <div className="text-xs font-normal text-gray-500 dark:text-gray-400">
            {source.notes}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-brand-blue hover:underline"
          >
            {source.url}
          </a>
        ) : (
          <span className="text-xs italic text-gray-500">(query template)</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          className={cn(
            "inline-flex h-5 w-9 items-center rounded-full transition-colors",
            source.enabled ? "bg-brand-blue" : "bg-gray-300 dark:bg-gray-600",
            pending && "opacity-60",
          )}
          aria-pressed={source.enabled}
          aria-label={source.enabled ? "Disable source" : "Enable source"}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              source.enabled ? "translate-x-4" : "translate-x-1",
            )}
          />
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <input
          type="number"
          min={0}
          max={10}
          step={0.1}
          value={weightDraft}
          onChange={(e) => setWeightDraft(e.target.value)}
          onBlur={handleWeightCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          disabled={pending}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        />
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
        {source.items_7d}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
        {acceptRate}
      </td>
      <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">
        {formatDate(source.last_discovered_at) || "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
          title="Delete source"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function AddSourceModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (body: AdminSourceCreateBody) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorText(null);
    try {
      await onCreate({
        category: "rss",
        name: name.trim(),
        url: url.trim(),
        notes: notes.trim() || null,
      });
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Failed to add source");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-dark-surface">
        <form onSubmit={handleSubmit}>
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Add RSS source
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              The URL is validated with a HEAD request before being added.
            </p>
          </div>
          <div className="space-y-4 px-5 py-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Display name
              </span>
              <input
                type="text"
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Feed URL
              </span>
              <input
                type="url"
                value={url}
                required
                placeholder="https://example.com/feed"
                onChange={(e) => setUrl(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Notes (optional)
              </span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
              />
            </label>
            {errorText && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {errorText}
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add source
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage tab (PR C)
// ---------------------------------------------------------------------------

const COVERAGE_WINDOWS: CoverageWindowDays[] = [7, 30, 90];
// Workstream "stale" threshold for the freshness widget. Anything beyond
// this many days (or never scanned) gets the warning treatment.
const STALE_THRESHOLD_DAYS = 7;
// Pre-computed in case the request comes back without `expected_share`
// (e.g. older payload during a deploy roll). Six pillars → 1/6 each.
const FALLBACK_EXPECTED_SHARE = 1 / 6;

function CoverageTab({
  pillarData,
  workstreams,
  loading,
  windowDays,
  onWindowChange,
  onRefresh,
  onForceScan,
}: {
  pillarData: PillarCoverageResponse | null;
  workstreams: WorkstreamCoverageItem[];
  loading: boolean;
  windowDays: CoverageWindowDays;
  onWindowChange: (days: CoverageWindowDays) => void;
  onRefresh: () => Promise<void>;
  onForceScan: (workstreamId: string) => Promise<void>;
}) {
  return (
    <div className="space-y-8">
      <PillarBalanceWidget
        data={pillarData}
        windowDays={windowDays}
        onWindowChange={onWindowChange}
        loading={loading}
      />
      <WorkstreamFreshnessTable
        items={workstreams}
        loading={loading}
        onRefresh={onRefresh}
        onForceScan={onForceScan}
      />
    </div>
  );
}

function PillarBalanceWidget({
  data,
  windowDays,
  onWindowChange,
  loading,
}: {
  data: PillarCoverageResponse | null;
  windowDays: CoverageWindowDays;
  onWindowChange: (days: CoverageWindowDays) => void;
  loading: boolean;
}) {
  const buckets = useMemo(() => {
    if (!data)
      return [] as Array<{
        code: string;
        name: string;
        cards: number;
        share: number;
        drift: number;
      }>;
    return Object.entries(data.by_pillar).map(([code, bucket]) => ({
      code,
      ...bucket,
    }));
  }, [data]);

  // Bar widths are normalized against the largest bucket so a low-volume
  // window still produces a visible chart. Falls back to share when every
  // bucket is zero (loading / fresh-install case).
  const maxCards = useMemo(
    () => buckets.reduce((acc, b) => Math.max(acc, b.cards), 0),
    [buckets],
  );

  const expectedShare =
    data?.by_pillar.CH?.expected_share ?? FALLBACK_EXPECTED_SHARE;

  return (
    <section>
      <SectionHeader
        title="Pillar balance"
        description={`Cards created per Austin strategic pillar over the selected window. Expected share is uniform across the six pillars (${(expectedShare * 100).toFixed(1)}% each).`}
        action={
          <div className="flex items-center gap-2">
            {COVERAGE_WINDOWS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => onWindowChange(days)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  windowDays === days
                    ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200",
                )}
              >
                {days}d
              </button>
            ))}
          </div>
        }
      />
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface">
        {loading && !data ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading coverage…
          </div>
        ) : !data ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No data yet. Click Refresh after a discovery run completes.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {data.total} cards in window
                {data.unassigned > 0 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    ({data.unassigned} unassigned)
                  </span>
                )}
              </span>
              <span className="text-xs text-gray-400">
                since {formatDate(data.since)}
              </span>
            </div>
            <ul className="space-y-2">
              {buckets.map((bucket) => (
                <PillarBar
                  key={bucket.code}
                  code={bucket.code}
                  name={bucket.name}
                  cards={bucket.cards}
                  share={bucket.share}
                  drift={bucket.drift}
                  maxCards={maxCards}
                  expectedShare={expectedShare}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function PillarBar({
  code,
  name,
  cards,
  share,
  drift,
  maxCards,
  expectedShare,
}: {
  code: string;
  name: string;
  cards: number;
  share: number;
  drift: number;
  maxCards: number;
  expectedShare: number;
}) {
  // Use share-relative bar so 0 cards still renders a baseline line at the
  // expected-share mark rather than collapsing to nothing visible.
  const widthPct = maxCards > 0 ? (cards / maxCards) * 100 : 0;
  const baselinePct = maxCards > 0 ? Math.min(100, expectedShare * 100) : 0;
  // Drift > 5pp colored; otherwise neutral. Keeps the chart readable.
  const driftClass =
    drift >= 0.05
      ? "text-emerald-600 dark:text-emerald-400"
      : drift <= -0.05
        ? "text-amber-600 dark:text-amber-400"
        : "text-gray-500 dark:text-gray-400";
  return (
    <li className="flex items-center gap-3">
      <div className="w-44 shrink-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {code}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{name}</div>
      </div>
      <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-dark-surface-deep">
        <div
          className="h-full bg-brand-blue/80"
          style={{ width: `${widthPct}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-gray-500/60"
          style={{ left: `${baselinePct}%` }}
          title={`Expected share ${(expectedShare * 100).toFixed(1)}%`}
        />
      </div>
      <div className="w-32 shrink-0 text-right text-xs">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {cards} ({(share * 100).toFixed(1)}%)
        </div>
        <div className={driftClass}>
          {drift >= 0 ? "+" : ""}
          {(drift * 100).toFixed(1)}pp
        </div>
      </div>
    </li>
  );
}

function WorkstreamFreshnessTable({
  items,
  loading,
  onRefresh,
  onForceScan,
}: {
  items: WorkstreamCoverageItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onForceScan: (workstreamId: string) => Promise<void>;
}) {
  const [scanning, setScanning] = useState<string | null>(null);

  const handleScan = useCallback(
    async (workstreamId: string) => {
      setScanning(workstreamId);
      try {
        await onForceScan(workstreamId);
      } finally {
        setScanning(null);
      }
    },
    [onForceScan],
  );

  return (
    <section>
      <SectionHeader
        title="Workstream freshness"
        description="Workstreams sorted stale-first. Force scan enqueues a targeted run; the worker picks it up on the next tick."
        action={
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        }
      />
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-dark-surface-deep">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-2">Workstream</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Last scan</th>
              <th className="px-4 py-2">Scans 30d</th>
              <th className="px-4 py-2">Cards 30d</th>
              <th className="px-4 py-2">Auto-scan</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-dark-surface">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  {loading ? "Loading workstreams…" : "No workstreams to show."}
                </td>
              </tr>
            ) : (
              items.map((ws) => (
                <FreshnessRow
                  key={ws.id}
                  ws={ws}
                  scanning={scanning === ws.id}
                  onScan={() => handleScan(ws.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FreshnessRow({
  ws,
  scanning,
  onScan,
}: {
  ws: WorkstreamCoverageItem;
  scanning: boolean;
  onScan: () => void;
}) {
  const isStale = useMemo(() => {
    if (!ws.last_scanned_at) return true;
    const last = new Date(ws.last_scanned_at).getTime();
    if (Number.isNaN(last)) return true;
    const ageDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return ageDays > STALE_THRESHOLD_DAYS;
  }, [ws.last_scanned_at]);

  return (
    <tr className={cn(isStale && "bg-amber-50/40 dark:bg-amber-900/10")}>
      <td className="px-4 py-2">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {ws.name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {ws.id.slice(0, 8)}
        </div>
      </td>
      <td className="px-4 py-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            ws.owner_type === "org"
              ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue"
              : "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-dark-surface-deep dark:text-gray-300",
          )}
        >
          {ws.owner_type}
        </span>
      </td>
      <td className="px-4 py-2">
        {ws.last_scanned_at ? (
          <div className="flex items-center gap-2">
            {isStale && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            <span className="text-gray-700 dark:text-gray-200">
              {formatDate(ws.last_scanned_at)}
            </span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Never
          </span>
        )}
      </td>
      <td className="px-4 py-2 tabular-nums text-gray-700 dark:text-gray-200">
        {ws.scans_30d}
      </td>
      <td className="px-4 py-2 tabular-nums text-gray-700 dark:text-gray-200">
        {ws.cards_added_30d}
      </td>
      <td className="px-4 py-2">
        {ws.auto_scan ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <span className="text-xs text-gray-400">off</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <button
          type="button"
          onClick={onScan}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
        >
          {scanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          Force scan
        </button>
      </td>
    </tr>
  );
}

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
      const [usageData, recentData] = await Promise.all([
        fetchUsageSummary(token, usageDays),
        fetchRecentUsage(token, 50),
      ]);
      setUsage(usageData);
      setRecentUsage(recentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage");
    }
  }, [usageDays]);

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
    try {
      const token = await getToken();
      const [pillars, workstreams] = await Promise.all([
        fetchPillarCoverage(token, days),
        fetchWorkstreamCoverage(token),
      ]);
      setPillarCoverage(pillars);
      setWorkstreamCoverage(workstreams.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coverage");
    } finally {
      setCoverageLoading(false);
    }
  }, []);

  const loadPillarOnly = useCallback(async (days: CoverageWindowDays) => {
    try {
      const token = await getToken();
      const pillars = await fetchPillarCoverage(token, days);
      setPillarCoverage(pillars);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh pillar window",
      );
    }
  }, []);

  // Lazy-load coverage when the tab is first opened. Subsequent window
  // changes hit loadPillarOnly so we don't re-aggregate the WS table.
  useEffect(() => {
    if (
      isAdmin &&
      activeTab === "coverage" &&
      pillarCoverage === null &&
      !coverageLoading
    ) {
      loadCoverage(coverageDays);
    }
  }, [
    isAdmin,
    activeTab,
    pillarCoverage,
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
            <OperationsTab jobs={jobs} onAction={runAction} />
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
        </>
      )}
    </div>
  );
};

export default AdminConsole;
