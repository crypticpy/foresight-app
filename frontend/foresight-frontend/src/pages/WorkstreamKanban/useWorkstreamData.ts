/**
 * Workstream + cards data lifecycle for the kanban page: loads the
 * workstream row, fetches grouped cards, runs the on-mount auto-populate,
 * and exposes refresh/auto-populate handlers. Keeps the composer free of
 * the supabase select and the cardsLoading/refreshing/autoPopulating state.
 *
 * @module pages/WorkstreamKanban/useWorkstreamData
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { User } from "@supabase/supabase-js";

import { getAuthToken } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { supabase } from "../../lib/supabase";
import {
  autoPopulateWorkstream,
  fetchWorkstreamCards,
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
      const groupedCards = await fetchWorkstreamCards(token, workstreamId);
      setCards(groupedCards);
    } catch (err) {
      console.error("Error loading cards:", err);
      showToast("error", "Failed to load signals");
    } finally {
      setCardsLoading(false);
    }
  }, [workstreamId, showToast]);

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
