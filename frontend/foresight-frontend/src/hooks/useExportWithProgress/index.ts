/**
 * useExportWithProgress — manages PDF/PPTX export flows for briefs and
 * cards with real-time progress tracking. Supports Gamma-powered AI
 * exports (with simulated progress) and standard exports, and handles
 * cancellation, mount cleanup, and stale-update protection.
 *
 * @module hooks/useExportWithProgress
 */

import { useCallback, useRef } from "react";

import type { ExportFormat } from "../../components/ExportProgressModal";
import { API_BASE_URL } from "../../lib/config";

import { parseFilename, readErrorMessage } from "./parseFilename";
import {
  GAMMA_ESTIMATED_TIME,
  POLL_INTERVAL,
  type UseExportWithProgressReturn,
} from "./state";
import { useExportLifecycle } from "./useExportLifecycle";

export type { ExportState, UseExportWithProgressReturn } from "./state";

interface LastExport {
  type: "brief" | "card";
  workstreamId?: string;
  cardId: string;
  format: ExportFormat;
  itemName?: string;
  version?: number;
}

function gammaProgressMessage(progress: number): string {
  if (progress < 30) return "AI is analyzing your brief content...";
  if (progress < 50) return "Generating slides and images...";
  if (progress < 70) return "Creating data visualizations...";
  return "Finalizing presentation...";
}

export function useExportWithProgress(
  getToken: () => Promise<string | null>,
): UseExportWithProgressReturn {
  const {
    state,
    updateState,
    resetState,
    cleanupExport,
    beginExport,
    abortControllerRef,
    progressIntervalRef,
    revokeTimeoutRef,
  } = useExportLifecycle();

  const lastExportRef = useRef<LastExport | null>(null);

  const closeModal = useCallback(() => {
    cleanupExport();
    updateState({ showModal: false });
    setTimeout(resetState, 300);
  }, [cleanupExport, updateState, resetState]);

  const downloadExport = useCallback(() => {
    if (!state.downloadUrl) return;
    const link = document.createElement("a");
    link.href = state.downloadUrl;
    link.download = state.filename || `export.${state.format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    revokeTimeoutRef.current = setTimeout(() => {
      if (state.downloadUrl) {
        URL.revokeObjectURL(state.downloadUrl);
      }
      revokeTimeoutRef.current = null;
    }, 1000);
  }, [state.downloadUrl, state.filename, state.format, revokeTimeoutRef]);

  const exportBrief = useCallback(
    async (
      workstreamId: string,
      cardId: string,
      format: ExportFormat,
      itemName?: string,
      version?: number,
    ) => {
      cleanupExport();
      const isCurrentExport = beginExport();

      lastExportRef.current = {
        type: "brief",
        workstreamId,
        cardId,
        format,
        itemName,
        version,
      };

      const isGamma = format === "pptx";

      updateState({
        isExporting: true,
        showModal: true,
        status: "preparing",
        format,
        progress: 0,
        statusMessage: "Preparing your export...",
        errorMessage: null,
        downloadUrl: null,
        filename: null,
        itemName: itemName || "Executive Brief",
        isGammaPowered: isGamma,
        estimatedTimeSeconds: isGamma ? GAMMA_ESTIMATED_TIME : 15,
      });

      try {
        const token = await getToken();
        if (!token) throw new Error("Authentication required");
        if (!isCurrentExport()) return;

        updateState({
          status: "generating",
          progress: 10,
          statusMessage: isGamma
            ? "AI is designing your presentation..."
            : "Generating PDF document...",
        });

        const url = version
          ? `${API_BASE_URL}/api/v1/me/workstreams/${workstreamId}/cards/${cardId}/brief/export/${format}?version=${version}`
          : `${API_BASE_URL}/api/v1/me/workstreams/${workstreamId}/cards/${cardId}/brief/export/${format}`;

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        if (isGamma) {
          let currentProgress = 10;
          progressIntervalRef.current = setInterval(() => {
            if (!isCurrentExport()) {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
              }
              return;
            }
            currentProgress = Math.min(currentProgress + 5, 85);
            updateState({
              progress: currentProgress,
              statusMessage: gammaProgressMessage(currentProgress),
            });
          }, POLL_INTERVAL);
        }

        const response = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        });

        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }

        if (!isCurrentExport()) return;

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        updateState({
          status: "processing",
          progress: 90,
          statusMessage: "Processing download...",
        });

        const blob = await response.blob();
        if (!isCurrentExport()) return;

        const filename = parseFilename(
          response.headers.get("content-disposition"),
          `brief-export.${format}`,
        );
        const downloadUrl = URL.createObjectURL(blob);

        updateState({
          isExporting: false,
          status: "completed",
          progress: 100,
          statusMessage: "Your export is ready!",
          downloadUrl,
          filename,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!isCurrentExport()) return;
        updateState({
          isExporting: false,
          status: "error",
          progress: 0,
          statusMessage: "Export failed",
          errorMessage:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
        });
      }
    },
    [
      getToken,
      cleanupExport,
      beginExport,
      updateState,
      abortControllerRef,
      progressIntervalRef,
    ],
  );

  const exportCard = useCallback(
    async (cardId: string, format: ExportFormat, itemName?: string) => {
      cleanupExport();
      const isCurrentExport = beginExport();

      lastExportRef.current = { type: "card", cardId, format, itemName };

      updateState({
        isExporting: true,
        showModal: true,
        status: "preparing",
        format,
        progress: 0,
        statusMessage: "Preparing your export...",
        errorMessage: null,
        downloadUrl: null,
        filename: null,
        itemName: itemName || "Card Export",
        isGammaPowered: false,
        estimatedTimeSeconds: 15,
      });

      try {
        const token = await getToken();
        if (!token) throw new Error("Authentication required");
        if (!isCurrentExport()) return;

        updateState({
          status: "generating",
          progress: 30,
          statusMessage: "Generating export...",
        });

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const response = await fetch(
          `${API_BASE_URL}/api/v1/cards/${cardId}/export/${format}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            signal: abortController.signal,
          },
        );

        if (!isCurrentExport()) return;

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        updateState({
          status: "processing",
          progress: 80,
          statusMessage: "Processing download...",
        });

        const blob = await response.blob();
        if (!isCurrentExport()) return;

        const filename = parseFilename(
          response.headers.get("content-disposition"),
          `card-export.${format}`,
        );
        const downloadUrl = URL.createObjectURL(blob);

        updateState({
          isExporting: false,
          status: "completed",
          progress: 100,
          statusMessage: "Your export is ready!",
          downloadUrl,
          filename,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!isCurrentExport()) return;
        updateState({
          isExporting: false,
          status: "error",
          progress: 0,
          statusMessage: "Export failed",
          errorMessage:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
        });
      }
    },
    [getToken, cleanupExport, beginExport, updateState, abortControllerRef],
  );

  const retryExport = useCallback(() => {
    const last = lastExportRef.current;
    if (!last) return;
    if (last.type === "brief" && last.workstreamId) {
      exportBrief(
        last.workstreamId,
        last.cardId,
        last.format,
        last.itemName,
        last.version,
      );
    } else if (last.type === "card") {
      exportCard(last.cardId, last.format, last.itemName);
    }
  }, [exportBrief, exportCard]);

  return {
    state,
    exportBrief,
    exportCard,
    closeModal,
    retryExport,
    downloadExport,
  };
}

export default useExportWithProgress;
