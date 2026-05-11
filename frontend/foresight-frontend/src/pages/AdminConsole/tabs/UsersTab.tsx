/**
 * Users tab — admin role + account type management with email/search
 * filters. Saves drop straight through to the parent handler.
 *
 * @module pages/AdminConsole/tabs/UsersTab
 */

import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";

import { type AdminUser } from "../../../lib/admin-api";
import { formatDate, SectionHeader } from "../helpers";

export function UsersTab({
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
