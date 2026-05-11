/**
 * Data-access helpers for the Workstreams list page: the workstream list,
 * scan-status fetch (used both on initial load and during polling), and the
 * driver-map build that turns every framework's drivers into a flat lookup.
 *
 * @module pages/Workstreams/api
 */

import type { Workstream } from "../../components/WorkstreamForm";
import {
  getFramework,
  listFrameworks,
  type Driver,
} from "../../lib/frameworks-api";
import { supabase } from "../../lib/supabase";
import {
  getWorkstreamScanStatus,
  listWorkstreams,
  type WorkstreamScanStatusResponse,
} from "../../lib/workstream-api";
import { isUserOwnedWorkstream } from "./ownership";

export async function loadWorkstreamList(token: string): Promise<Workstream[]> {
  const list = (await listWorkstreams<Workstream>(token)) ?? [];
  return list;
}

export async function deleteWorkstream(
  id: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("workstreams")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export interface ScanStatusFetch {
  statuses: Record<string, WorkstreamScanStatusResponse>;
  hasActiveScans: boolean;
}

export async function fetchScanStatuses(
  token: string,
  workstreams: Workstream[],
): Promise<ScanStatusFetch> {
  const wsList = workstreams.filter(isUserOwnedWorkstream);
  if (wsList.length === 0) {
    return { statuses: {}, hasActiveScans: false };
  }

  const statuses: Record<string, WorkstreamScanStatusResponse> = {};
  let hasActiveScans = false;

  const results = await Promise.allSettled(
    wsList.map(async (ws) => {
      try {
        const status = await getWorkstreamScanStatus(token, ws.id);
        return { id: ws.id, status };
      } catch {
        // No scan found for this workstream — that's fine.
        return null;
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      const { id, status } = result.value;
      statuses[id] = status;
      if (status.status === "queued" || status.status === "running") {
        hasActiveScans = true;
      }
    }
  }

  return { statuses, hasActiveScans };
}

/**
 * Build a flat driver lookup by fetching every framework and indexing all
 * `categories[].drivers[]` entries by id. Returns an empty map if any step
 * fails — driver chips simply won't render on cards.
 */
export async function loadDriverMap(
  token: string,
): Promise<Record<string, Driver>> {
  const summaries = await listFrameworks(token);
  const frameworks = await Promise.all(
    summaries.map((s) => getFramework(token, s.code).catch(() => null)),
  );
  const map: Record<string, Driver> = {};
  for (const fw of frameworks) {
    if (!fw) continue;
    for (const cat of fw.categories) {
      for (const driver of cat.drivers) {
        map[driver.id] = driver;
      }
    }
  }
  return map;
}
