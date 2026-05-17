/**
 * Workstream + cards data lifecycle for the kanban page: loads the
 * workstream row, fetches grouped cards, runs the on-mount auto-populate,
 * and exposes refresh/auto-populate handlers. Keeps the composer free of
 * the supabase select and the cardsLoading/refreshing/autoPopulating state.
 *
 * @module pages/WorkstreamKanban/useWorkstreamData
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { User } from "@supabase/supabase-js";

import { getAuthToken } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { supabase } from "../../lib/supabase";
import {
  autoPopulateWorkstream,
  fetchWorkstreamCards,
  fetchWorkstreamCardsByStatus,
} from "../../lib/workstream-api";
import {
  materializeAndResolveTemplateClone,
  resolveTemplateIdToClone,
} from "../../lib/workstream/clone-resolution";
import type { KanbanStatus, WorkstreamCard } from "../../components/kanban";
import type { Workstream } from "../../components/WorkstreamForm";

import type { ToastType } from "./types";

const EMPTY_COLUMNS: Record<KanbanStatus, WorkstreamCard[]> = {
  inbox: [],
  working: [],
  ready: [],
  archived: [],
};

const EMPTY_HAS_MORE: Record<KanbanStatus, boolean> = {
  inbox: false,
  working: false,
  ready: false,
  archived: false,
};

const EMPTY_OFFSETS: Record<KanbanStatus, number> = {
  inbox: 0,
  working: 0,
  ready: 0,
  archived: 0,
};

const COLUMN_PAGE_SIZE = 50;

export interface UseWorkstreamDataOptions {
  workstreamId: string | undefined;
  user: User | null;
  showToast: (type: ToastType, message: string) => void;
}

export function useWorkstreamData({
  workstreamId,
  user,
  showToast,
}: UseWorkstreamDataOptions) {
  const navigate = useNavigate();
  const [workstream, setWorkstream] = useState<Workstream | null>(null);
  const [cards, setCards] =
    useState<Record<KanbanStatus, WorkstreamCard[]>>(EMPTY_COLUMNS);
  const [hasMore, setHasMore] =
    useState<Record<KanbanStatus, boolean>>(EMPTY_HAS_MORE);
  const offsetsRef = useRef<Record<KanbanStatus, number>>({ ...EMPTY_OFFSETS });
  const loadingMoreRef = useRef<Record<KanbanStatus, boolean>>({
    inbox: false,
    working: false,
    ready: false,
    archived: false,
  });
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoPopulating, setAutoPopulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkstream = useCallback(async () => {
    if (!workstreamId || !user) return;

    try {
      // If the URL points at an org-template id (e.g. an old bookmark from
      // before the per-user clones rollout, or a redirect from another
      // surface), redirect to the caller's clone. We do this in two phases
      // so a normal user-owned workstream load doesn't pay for the heavy
      // `/me/workstreams` materialization round-trip (which would also
      // create clones for every untouched org template):
      //   1. Cheap local pointer lookup — single RLS-protected select; if
      //      the user already has a clone for this template id, redirect.
      //   2. Otherwise try the direct workstream fetch. Only if it fails
      //      (the RLS-blocked template case) do we trigger server-side
      //      materialization and re-resolve.
      const token = await getAuthToken();
      const existingClone = await resolveTemplateIdToClone(workstreamId);
      if (existingClone && existingClone !== workstreamId) {
        navigate(`/workstreams/${existingClone}/board`, { replace: true });
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("workstreams")
        .select("*")
        .eq("id", workstreamId)
        .single();

      if (fetchError) {
        // Direct fetch failed — could be a genuine missing/permission case
        // OR an org-template id we haven't materialized yet. Try the
        // ensuring path; if it yields a clone id, redirect there. Otherwise
        // surface the original error.
        if (token) {
          const materializedClone = await materializeAndResolveTemplateClone(
            workstreamId,
            token,
          );
          if (materializedClone && materializedClone !== workstreamId) {
            navigate(`/workstreams/${materializedClone}/board`, {
              replace: true,
            });
            return;
          }
        }
        console.error("Error loading workstream:", fetchError);
        setError(
          "Failed to load workstream. It may not exist or you may not have access.",
        );
        return;
      }

      const isOwner = data.user_id === user.id;
      const isOrgOwned = data.owner_type === "org";
      if (!isOwner && !isOrgOwned) {
        setError("You do not have access to this workstream.");
        return;
      }

      // Stamp a derived `role` so useCapabilities.forWorkstream returns the
      // right caps — the raw row has no `role` column.
      setWorkstream({
        ...data,
        role: isOwner ? "owner" : isOrgOwned ? "org_viewer" : undefined,
      });
    } catch (err) {
      console.error("Error loading workstream:", err);
      setError("An unexpected error occurred.");
    }
  }, [workstreamId, user, navigate]);

  const loadCards = useCallback(async () => {
    if (!workstreamId) return;
    const token = await getAuthToken();
    if (!token) {
      showToast("error", "Authentication required");
      return;
    }
    try {
      setCardsLoading(true);
      const grouped = await fetchWorkstreamCards(
        token,
        workstreamId,
        COLUMN_PAGE_SIZE,
      );
      setCards({
        inbox: grouped.inbox,
        working: grouped.working,
        ready: grouped.ready,
        archived: grouped.archived,
      });
      setHasMore(grouped.has_more);
      offsetsRef.current = {
        inbox: grouped.inbox.length,
        working: grouped.working.length,
        ready: grouped.ready.length,
        archived: grouped.archived.length,
      };
      loadingMoreRef.current = {
        inbox: false,
        working: false,
        ready: false,
        archived: false,
      };
    } catch (err) {
      console.error("Error loading cards:", err);
      showToast("error", "Failed to load signals");
    } finally {
      setCardsLoading(false);
    }
  }, [workstreamId, showToast]);

  const loadMoreColumn = useCallback(
    async (status: KanbanStatus) => {
      if (!workstreamId) return;
      if (loadingMoreRef.current[status]) return;
      if (!hasMore[status]) return;
      const token = await getAuthToken();
      if (!token) return;
      loadingMoreRef.current[status] = true;
      try {
        const page = await fetchWorkstreamCardsByStatus(
          token,
          workstreamId,
          status,
          offsetsRef.current[status],
          COLUMN_PAGE_SIZE,
        );
        // Dedupe by id — defensive against rare timing where a card was
        // added/moved between pages.
        setCards((prev) => {
          const seen = new Set(prev[status].map((c) => c.id));
          const incoming = page.cards.filter((c) => !seen.has(c.id));
          return { ...prev, [status]: [...prev[status], ...incoming] };
        });
        offsetsRef.current[status] = page.next_offset;
        setHasMore((prev) => ({ ...prev, [status]: page.has_more }));
      } catch (err) {
        console.error(`Error loading more ${status} cards:`, err);
        showToast("error", "Failed to load more signals");
      } finally {
        loadingMoreRef.current[status] = false;
      }
    },
    [workstreamId, hasMore, showToast],
  );

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      await loadWorkstream();
      setLoading(false);
    };
    run();
  }, [loadWorkstream]);

  useEffect(() => {
    if (!workstream || !workstreamId) return;
    const run = async () => {
      await loadCards();
      try {
        const token = await getAuthToken();
        if (!token) return;
        const result = await autoPopulateWorkstream(token, workstreamId, 20);
        if (result.added > 0) {
          showToast(
            "info",
            `${result.added} new signal${result.added !== 1 ? "s" : ""} added to inbox`,
          );
          await loadCards();
        }
      } catch (err) {
        logger.warn("Auto-populate on load failed:", err);
      }
    };
    run();
  }, [workstream, workstreamId, loadCards, showToast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCards();
    setRefreshing(false);
    showToast("success", "Signals refreshed");
  }, [loadCards, showToast]);

  const handleAutoPopulate = useCallback(async () => {
    if (!workstreamId) return;
    const token = await getAuthToken();
    if (!token) {
      showToast("error", "Authentication required");
      return;
    }
    try {
      setAutoPopulating(true);
      const result = await autoPopulateWorkstream(token, workstreamId);
      if (result.added > 0) {
        showToast(
          "success",
          `Added ${result.added} signal${result.added !== 1 ? "s" : ""} to inbox`,
        );
        await loadCards();
      } else {
        showToast("info", "No new matching signals found");
      }
    } catch (err) {
      console.error("Error auto-populating:", err);
      showToast("error", "Failed to auto-populate workstream");
    } finally {
      setAutoPopulating(false);
    }
  }, [workstreamId, loadCards, showToast]);

  return {
    workstream,
    cards,
    setCards,
    hasMore,
    loadMoreColumn,
    loading,
    cardsLoading,
    refreshing,
    autoPopulating,
    error,
    loadWorkstream,
    loadCards,
    handleRefresh,
    handleAutoPopulate,
  };
}
