/**
 * Bootstrap hook — fetches the four "always-needed" admin payloads in one
 * round trip (overview, users, settings, recent jobs) and exposes the CRUD
 * handlers that update them. Splitting this from windowed data (usage /
 * audit) keeps changes to those windows from re-pulling the whole console.
 *
 * Cross-hook signal: `onCostSettingChanged` fires when a `FORESIGHT_COST_*`
 * setting is saved so the usage hook can re-pull its budget snapshot.
 *
 * @module pages/AdminConsole/hooks/useBootstrap
 */

import { useCallback, useEffect, useState } from "react";

import {
  applyDiscoveryPreset,
  fetchAdminOverview,
  fetchAdminSettings,
  fetchAdminUsers,
  fetchRecentJobs,
  updateAdminSetting,
  updateAdminUser,
  type AdminOverview,
  type AdminSetting,
  type AdminUser,
  type DiscoveryPreset,
  type RecentJobsResponse,
} from "../../../lib/admin-api";
import { getToken } from "../helpers";

export function useBootstrap({
  isAdmin,
  onError,
  onNotice,
  onCostSettingChanged,
}: {
  isAdmin: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onCostSettingChanged: () => void;
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [jobs, setJobs] = useState<RecentJobsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
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
      onError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const refreshUsers = useCallback(
    async (
      filters: { search?: string; account_type?: string; role?: string } = {},
    ) => {
      try {
        const token = await getToken();
        const data = await fetchAdminUsers(token, filters);
        setUsers(data.items);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to load users");
      }
    },
    [onError],
  );

  const saveUser = useCallback(
    async (user: AdminUser, patch: Partial<AdminUser>) => {
      try {
        const token = await getToken();
        const updated = await updateAdminUser(token, user.id, patch);
        setUsers((prev) =>
          prev.map((item) => (item.id === user.id ? updated : item)),
        );
        onNotice("User updated");
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to update user");
      }
    },
    [onError, onNotice],
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
          onCostSettingChanged();
        }
        onNotice("Setting saved");
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to save setting");
      }
    },
    [onError, onNotice, onCostSettingChanged],
  );

  const applyPreset = useCallback(
    async (preset: DiscoveryPreset) => {
      try {
        const token = await getToken();
        const result = await applyDiscoveryPreset(token, preset);
        const refreshed = await fetchAdminSettings(token);
        setSettings(refreshed.items);
        onNotice(
          `Applied ${result.preset} preset to ${result.items.length} discovery settings`,
        );
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to apply preset");
      }
    },
    [onError, onNotice],
  );

  return {
    overview,
    users,
    settings,
    jobs,
    loading,
    load,
    refreshUsers,
    saveUser,
    saveSetting,
    applyPreset,
    setJobs,
    setOverview,
  };
}
