/**
 * Discovery schedules hook — owns the list and CRUD handlers. Lazy-loads
 * on first tab open so the audit log writes from listing don't fire on
 * every console boot.
 *
 * @module pages/AdminConsole/hooks/useSchedules
 */

import { useCallback, useEffect, useState } from "react";

import {
  createAdminSchedule,
  deleteAdminSchedule,
  fetchAdminSchedules,
  updateAdminSchedule,
  type AdminSchedule,
  type AdminScheduleCreateBody,
  type AdminScheduleUpdateBody,
} from "../../../lib/admin-api";
import { getToken, type AdminTab } from "../helpers";

export function useSchedules({
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
  const [schedules, setSchedules] = useState<AdminSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const { items } = await fetchAdminSchedules(token);
      setSchedules(items);
      setLoaded(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (isAdmin && activeTab === "schedules" && !loaded) {
      load();
    }
  }, [isAdmin, activeTab, loaded, load]);

  const create = useCallback(
    async (body: AdminScheduleCreateBody) => {
      const token = await getToken();
      const created = await createAdminSchedule(token, body);
      // Re-fetch instead of splicing so the order matches the backend's
      // ORDER BY created_at ASC.
      await load();
      onNotice(`Created schedule "${created.name}"`);
    },
    [load, onNotice],
  );

  const edit = useCallback(
    async (scheduleId: string, patch: AdminScheduleUpdateBody) => {
      try {
        const token = await getToken();
        const updated = await updateAdminSchedule(token, scheduleId, patch);
        setSchedules((prev) =>
          prev.map((row) => (row.id === scheduleId ? updated : row)),
        );
        onNotice(`Schedule "${updated.name}" updated`);
      } catch (err) {
        // Surface the error in the console banner *and* rethrow so the
        // caller (typically the edit modal) sees the rejection and can
        // keep itself open with an inline error. Resolving the promise
        // here would tell the modal the save succeeded.
        onError(
          err instanceof Error ? err.message : "Failed to update schedule",
        );
        throw err;
      }
    },
    [onError, onNotice],
  );

  const remove = useCallback(
    async (scheduleId: string) => {
      try {
        const token = await getToken();
        await deleteAdminSchedule(token, scheduleId);
        setSchedules((prev) => prev.filter((row) => row.id !== scheduleId));
        onNotice("Schedule deleted");
      } catch (err) {
        onError(
          err instanceof Error ? err.message : "Failed to delete schedule",
        );
      }
    },
    [onError, onNotice],
  );

  return { schedules, loading, load, create, edit, remove };
}
