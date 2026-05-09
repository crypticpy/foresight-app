import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Database,
  History,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { supabase } from "../App";
import { useAuthContext } from "../hooks/useAuthContext";
import { cn } from "../lib/utils";
import {
  fetchAdminAuditLog,
  fetchAdminOverview,
  fetchAdminSettings,
  fetchAdminUsers,
  fetchRecentJobs,
  fetchRecentUsage,
  fetchUsageSummary,
  triggerAdminAction,
  updateAdminSetting,
  updateAdminUser,
  type AdminAuditEntry,
  type AdminOverview,
  type AdminSetting,
  type AdminUser,
  type RecentJobsResponse,
  type UsageEvent,
  type UsageSummary,
} from "../lib/admin-api";

type AdminTab =
  | "overview"
  | "users"
  | "operations"
  | "settings"
  | "usage"
  | "audit";

const tabs: Array<{ id: AdminTab; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "operations", label: "Operations", icon: Activity },
  { id: "settings", label: "Models & Chat", icon: SlidersHorizontal },
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
}: {
  settings: AdminSetting[];
  onSave: (setting: AdminSetting, value: unknown) => void;
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
            <SettingsTab settings={settings} onSave={saveSetting} />
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
