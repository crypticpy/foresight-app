/**
 * Scan orchestration for the kanban page: tracks `scanning` state, wires
 * `useWorkstreamScanPolling`, exposes `handleStartScan`, and handles the
 * "scanJustStarted" hand-off from the create-workstream route.
 *
 * @module pages/WorkstreamKanban/useScanFlow
 */

import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { getAuthToken } from "../../lib/auth";
import { useWorkstreamScanPolling } from "../../hooks/useWorkstreamScanPolling";
import {
  startWorkstreamScan,
  type WorkstreamScanStatusResponse,
} from "../../lib/workstream-api";

import type { ToastType } from "./types";

export interface UseScanFlowOptions {
  workstreamId: string | undefined;
  workstreamLoaded: boolean;
  showToast: (type: ToastType, message: string) => void;
  reloadCards: () => Promise<void>;
}

export interface UseScanFlowReturn {
  scanning: boolean;
  handleStartScan: () => Promise<void>;
}

export function useScanFlow({
  workstreamId,
  workstreamLoaded,
  showToast,
  reloadCards,
}: UseScanFlowOptions): UseScanFlowReturn {
  const navigate = useNavigate();
  const location = useLocation();
  const [scanning, setScanning] = useState(false);
  const [, setScanStatus] = useState<WorkstreamScanStatusResponse | null>(null);

  const scanJustStarted =
    (location.state as { scanJustStarted?: boolean })?.scanJustStarted === true;

  const { startPollingExistingScan } = useWorkstreamScanPolling({
    workstreamId,
    getAuthToken,
    onStatus: (status) => {
      setScanning(status.status === "queued" || status.status === "running");
      setScanStatus(status);
    },
    onComplete: async (status) => {
      setScanning(false);
      if (status.status === "completed") {
        const cardsAdded = status.results?.cards_added_to_workstream ?? 0;
        const cardsCreated = status.results?.cards_created ?? 0;
        if (cardsAdded > 0 || cardsCreated > 0) {
          showToast(
            "success",
            `Scan complete! ${cardsCreated} new signal${cardsCreated !== 1 ? "s" : ""} created, ${cardsAdded} added to inbox`,
          );
          await reloadCards();
        } else {
          showToast("info", "Scan complete - no new signals found");
        }
      } else if (status.status === "failed") {
        showToast("error", status.error_message || "Scan failed");
      }
    },
    onError: (msg) => {
      setScanning(false);
      showToast("error", msg);
    },
  });

  const handleStartScan = useCallback(async () => {
    if (!workstreamId) return;
    const token = await getAuthToken();
    if (!token) {
      showToast("error", "Authentication required");
      return;
    }

    try {
      setScanning(true);
      const response = await startWorkstreamScan(token, workstreamId);
      setScanStatus({
        scan_id: response.scan_id,
        workstream_id: response.workstream_id,
        status: response.status,
        created_at: new Date().toISOString(),
      });
      showToast("info", response.message);
      startPollingExistingScan(response.scan_id);
    } catch (err: unknown) {
      setScanning(false);
      const message =
        err instanceof Error ? err.message : "Failed to start scan";
      if (message.includes("Rate limit")) {
        showToast(
          "error",
          "Scan limit reached (2 per day). Try again tomorrow.",
        );
      } else if (message.includes("already in progress")) {
        showToast(
          "error",
          "A scan is already running. Please wait for it to complete.",
        );
      } else if (message.includes("keywords or pillars")) {
        showToast(
          "error",
          "Add keywords or pillars to this workstream to enable scanning.",
        );
      } else {
        showToast("error", message);
      }
    }
  }, [workstreamId, showToast, startPollingExistingScan]);

  // Resume polling for a scan started on the previous route.
  useEffect(() => {
    if (!scanJustStarted || !workstreamId || !workstreamLoaded) return;
    navigate(location.pathname, { replace: true, state: {} });
    showToast(
      "info",
      "Scan started! We're looking for signals matching your workstream...",
    );
    startPollingExistingScan();
  }, [
    scanJustStarted,
    workstreamId,
    workstreamLoaded,
    navigate,
    location.pathname,
    startPollingExistingScan,
    showToast,
  ]);

  return { scanning, handleStartScan };
}
