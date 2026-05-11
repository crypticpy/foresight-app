/**
 * Admin audit log hook — entries list + filter state. Re-fetches whenever
 * the target_type or sinceDays filter changes; gated on `isAdmin` so a
 * non-admin opening the page never issues the request.
 *
 * @module pages/AdminConsole/hooks/useAuditLog
 */

import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminAuditLog,
  type AdminAuditEntry,
} from "../../../lib/admin-api";
import { getToken } from "../helpers";

export type AuditFilters = {
  target_type: "user" | "setting" | "";
  sinceDays: number;
};

export function useAuditLog({
  isAdmin,
  onError,
}: {
  isAdmin: boolean;
  onError: (message: string) => void;
}) {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [filters, setFilters] = useState<AuditFilters>({
    target_type: "",
    sinceDays: 7,
  });

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const since =
        filters.sinceDays > 0
          ? new Date(
              Date.now() - filters.sinceDays * 24 * 60 * 60 * 1000,
            ).toISOString()
          : undefined;
      const data = await fetchAdminAuditLog(token, {
        limit: 200,
        target_type: filters.target_type || undefined,
        since,
      });
      setEntries(data.items);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load audit log");
    }
  }, [filters.target_type, filters.sinceDays, onError]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const updateFilters = useCallback((next: Partial<AuditFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  return { entries, filters, updateFilters, load };
}
