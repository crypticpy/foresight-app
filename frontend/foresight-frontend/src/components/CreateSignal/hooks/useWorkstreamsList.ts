/**
 * Loads the workstreams owned by the current user for the wizard dropdown.
 * Re-fetches whenever `enabled` flips true (i.e. the modal opens). Silently
 * swallows errors — the workstream selector is optional.
 *
 * @module CreateSignal/hooks/useWorkstreamsList
 */

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { getCurrentUserId } from "../../../lib/auth";
import type { WorkstreamOption } from "../wizardState";

export interface UseWorkstreamsListResult {
  workstreams: WorkstreamOption[];
  loadingWorkstreams: boolean;
}

export function useWorkstreamsList(enabled: boolean): UseWorkstreamsListResult {
  const [workstreams, setWorkstreams] = useState<WorkstreamOption[]>([]);
  const [loadingWorkstreams, setLoadingWorkstreams] = useState(true);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    async function load() {
      try {
        const userId = await getCurrentUserId();
        if (!userId || cancelled) return;

        const { data } = await supabase
          .from("workstreams")
          .select("id, name")
          .eq("user_id", userId)
          .order("name");

        if (data && !cancelled) {
          setWorkstreams(data);
        }
      } catch {
        // Silently fail - workstream selector is optional
      } finally {
        if (!cancelled) {
          setLoadingWorkstreams(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { workstreams, loadingWorkstreams };
}
