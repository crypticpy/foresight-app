/**
 * Org-template inspector hook for the AdminConsole Templates tab.
 *
 * Lists every `owner_type === "org"` workstream the admin can see, then fans
 * out parallel card-count fetches so the tab can show pool size per stage
 * without an extra round-trip when the admin scrolls. Failures on individual
 * count fetches are swallowed to a null so one broken template doesn't blank
 * the whole list.
 *
 * @module pages/AdminConsole/hooks/useTemplates
 */

import { useCallback, useEffect, useState } from "react";

import {
  fetchWorkstreamCards,
  listWorkstreams,
} from "../../../lib/workstream-api";
import type { Workstream } from "../../../types/workstream";
import { getToken, type AdminTab } from "../helpers";

export interface TemplateCounts {
  inbox: number;
  working: number;
  ready: number;
  archived: number;
  total: number;
}

export interface TemplateRow {
  workstream: Workstream;
  counts: TemplateCounts | null;
}

async function fetchCounts(
  token: string,
  workstreamId: string,
): Promise<TemplateCounts | null> {
  try {
    const grouped = await fetchWorkstreamCards(token, workstreamId);
    return {
      inbox: grouped.inbox.length,
      working: grouped.working.length,
      ready: grouped.ready.length,
      archived: grouped.archived.length,
      total:
        grouped.inbox.length +
        grouped.working.length +
        grouped.ready.length +
        grouped.archived.length,
    };
  } catch {
    return null;
  }
}

export function useTemplates({
  isAdmin,
  activeTab,
  onError,
}: {
  isAdmin: boolean;
  activeTab: AdminTab;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const all = await listWorkstreams<Workstream>(token);
      const templates = all.filter((w) => w.owner_type === "org");

      // Show rows immediately with counts=null so the admin sees the list
      // while count fetches are in flight. Templates can have hundreds of
      // cards; serialized fetches would be noticeably slow.
      setRows(templates.map((workstream) => ({ workstream, counts: null })));

      const counts = await Promise.all(
        templates.map((t) => fetchCounts(token, t.id)),
      );
      setRows(
        templates.map((workstream, i) => ({
          workstream,
          counts: counts[i] ?? null,
        })),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setAttempted(true);
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (isAdmin && activeTab === "templates" && !attempted && !loading) {
      load();
    }
  }, [isAdmin, activeTab, attempted, loading, load]);

  return { rows, loading, load };
}
