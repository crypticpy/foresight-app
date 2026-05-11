/**
 * Audit log tab — append-only record of admin user/setting mutations
 * with target-type + window filters and an inline before/after diff.
 *
 * @module pages/AdminConsole/tabs/AuditLogTab
 */

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { type AdminAuditEntry } from "../../../lib/admin-api";
import { formatDate, SectionHeader } from "../helpers";

export function AuditLogTab({
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
