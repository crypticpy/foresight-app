/**
 * Discovery sources hook — owns the sources list and exposes CRUD actions.
 * Lazy-loads on first tab open to avoid the 5K-row discovered_sources scan
 * during every console boot.
 *
 * @module pages/AdminConsole/hooks/useSources
 */

import { useCallback, useEffect, useState } from "react";

import {
  createAdminSource,
  deleteAdminSource,
  fetchAdminSources,
  updateAdminSource,
  type AdminSource,
  type AdminSourceCreateBody,
  type AdminSourceUpdateBody,
} from "../../../lib/admin-api";
import { getToken, type AdminTab } from "../helpers";

export function useSources({
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
  const [sources, setSources] = useState<AdminSource[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const { items } = await fetchAdminSources(token);
      setSources(items);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  // Lazy-load only when the tab is first opened so a 5K-row scan doesn't fire
  // on every console boot.
  useEffect(() => {
    if (isAdmin && activeTab === "sources" && sources.length === 0) {
      load();
    }
  }, [isAdmin, activeTab, sources.length, load]);

  const create = useCallback(
    async (body: AdminSourceCreateBody) => {
      const token = await getToken();
      const created = await createAdminSource(token, body);
      // Re-fetch so health stats land in one place rather than mixing
      // freshly-inserted (no stats yet) rows with stale cached values.
      await load();
      onNotice(`Added source "${created.name}"`);
    },
    [load, onNotice],
  );

  const edit = useCallback(
    async (sourceId: string, patch: AdminSourceUpdateBody) => {
      try {
        const token = await getToken();
        const updated = await updateAdminSource(token, sourceId, patch);
        setSources((prev) =>
          prev.map((row) =>
            row.id === sourceId ? { ...row, ...updated } : row,
          ),
        );
        onNotice("Source updated");
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to update source");
      }
    },
    [onError, onNotice],
  );

  const remove = useCallback(
    async (sourceId: string) => {
      try {
        const token = await getToken();
        await deleteAdminSource(token, sourceId);
        setSources((prev) => prev.filter((row) => row.id !== sourceId));
        onNotice("Source deleted");
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to delete source");
      }
    },
    [onError, onNotice],
  );

  return { sources, loading, load, create, edit, remove };
}
