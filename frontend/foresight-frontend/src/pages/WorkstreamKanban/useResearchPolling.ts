/**
 * Polls `/workstreams/:id/research-status` while any deep-dive / quick-update
 * task is queued or processing, exposes the per-card status map, and a
 * stable `startPolling` trigger the composer can fire when it kicks off a
 * new research task. The poll interval auto-stops once nothing is active.
 *
 * @module pages/WorkstreamKanban/useResearchPolling
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchResearchStatus,
  type WorkstreamResearchStatus,
} from "../../lib/workstream-api";

const POLL_INTERVAL_MS = 5000;

export interface UseResearchPollingArgs {
  workstreamId: string | undefined;
  getAuthToken: () => Promise<string | null>;
}

export interface UseResearchPollingResult {
  researchStatuses: Map<string, WorkstreamResearchStatus>;
  startPolling: () => void;
}

export function useResearchPolling({
  workstreamId,
  getAuthToken,
}: UseResearchPollingArgs): UseResearchPollingResult {
  const [researchStatuses, setResearchStatuses] = useState<
    Map<string, WorkstreamResearchStatus>
  >(new Map());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAndUpdate = useCallback(async () => {
    if (!workstreamId) return false;

    const token = await getAuthToken();
    if (!token) return false;

    try {
      const { tasks } = await fetchResearchStatus(token, workstreamId);

      const statusMap = new Map<string, WorkstreamResearchStatus>();
      for (const task of tasks) {
        statusMap.set(task.card_id, task);
      }
      setResearchStatuses(statusMap);

      return tasks.some(
        (t) => t.status === "queued" || t.status === "processing",
      );
    } catch (err) {
      console.error("Error fetching research status:", err);
      return false;
    }
  }, [workstreamId, getAuthToken]);

  const startPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    const poll = async () => {
      const hasActiveTasks = await fetchAndUpdate();
      if (!hasActiveTasks && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }, [fetchAndUpdate]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  return { researchStatuses, startPolling };
}
