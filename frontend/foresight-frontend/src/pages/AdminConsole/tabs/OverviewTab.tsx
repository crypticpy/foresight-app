/**
 * Overview tab — operational snapshot across users, signals, background
 * jobs, and runtime mode. Read-only summary view.
 *
 * @module pages/AdminConsole/tabs/OverviewTab
 */

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Users,
} from "lucide-react";

import { type AdminOverview } from "../../../lib/admin-api";
import { MetricCard, SectionHeader, StatusPill } from "../helpers";

export function OverviewTab({ overview }: { overview: AdminOverview | null }) {
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
