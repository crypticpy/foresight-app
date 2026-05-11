/**
 * Bulk-portfolio export wiring for the kanban page. Owns the bulk-export
 * modal state plus the handler that calls `exportBulkBriefs` and opens the
 * returned PPTX/PDF URL in a new tab.
 *
 * @module pages/WorkstreamKanban/useBulkExport
 */

import { useCallback, useState } from "react";

import { getAuthToken } from "../../lib/auth";
import {
  exportBulkBriefs,
  type BulkBriefStatusResponse,
} from "../../lib/workstream-api";

import type { ToastType } from "./types";

export interface UseBulkExportOptions {
  workstreamId: string | undefined;
  showToast: (type: ToastType, message: string) => void;
}

export function useBulkExport({
  workstreamId,
  showToast,
}: UseBulkExportOptions) {
  const [showBulkExportModal, setShowBulkExportModal] = useState(false);
  const [bulkExportStatus, setBulkExportStatus] =
    useState<BulkBriefStatusResponse | null>(null);
  const [bulkExportError, setBulkExportError] = useState<string | null>(null);
  const [isBulkExporting, setIsBulkExporting] = useState(false);

  const handleCloseBulkExport = useCallback(() => {
    if (isBulkExporting) return;
    setShowBulkExportModal(false);
    setBulkExportStatus(null);
    setBulkExportError(null);
  }, [isBulkExporting]);

  const handleExecuteBulkExport = useCallback(
    async (format: "pptx" | "pdf", cardOrder: string[]) => {
      if (!workstreamId) return;

      setIsBulkExporting(true);

      try {
        const token = await getAuthToken();
        if (!token) {
          showToast("error", "Authentication required");
          return;
        }

        showToast("info", `Generating ${format.toUpperCase()} portfolio...`);
        const result = await exportBulkBriefs(
          token,
          workstreamId,
          format,
          cardOrder,
        );

        if (result.status === "success" || result.status === "completed") {
          if (result.pptx_url) {
            window.open(result.pptx_url, "_blank");
            showToast("success", "Portfolio presentation opened in new tab");
          } else {
            showToast("success", "Portfolio export completed");
          }
          setShowBulkExportModal(false);
        } else if (result.error) {
          showToast("error", result.error);
        }
      } catch (err) {
        console.error("Bulk export error:", err);
        showToast(
          "error",
          err instanceof Error ? err.message : "Export failed",
        );
      } finally {
        setIsBulkExporting(false);
      }
    },
    [workstreamId, showToast],
  );

  return {
    showBulkExportModal,
    setShowBulkExportModal,
    bulkExportStatus,
    bulkExportError,
    bulkExportLoading: false,
    isBulkExporting,
    handleCloseBulkExport,
    handleExecuteBulkExport,
  };
}
