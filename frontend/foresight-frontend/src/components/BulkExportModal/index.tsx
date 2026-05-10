/**
 * BulkExportModal — pre-export validation modal for portfolio briefs.
 * Shows ready-vs-not-ready signal counts, lists the cards in Kanban
 * order, lets the user pick PPTX (Gamma) or PDF, then surfaces a live
 * progress indicator while the export is running.
 *
 * @module components/BulkExportModal
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle,
  Download,
  FileText,
  Loader2,
  Presentation,
  X,
} from "lucide-react";

import { cn } from "../../lib/utils";
import type { BulkBriefStatusResponse } from "../../lib/workstream-api";

import { CardStatusRow } from "./CardStatusRow";
import { COA_COLORS, ESTIMATED_SECONDS_PER_CARD } from "./constants";
import { ExportProgressIndicator } from "./ExportProgressIndicator";
import { FormatOption } from "./FormatOption";
import { useExportTimer } from "./useExportTimer";

export interface BulkExportModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Workstream name for display */
  workstreamName: string;
  /** Status data from API */
  statusData: BulkBriefStatusResponse | null;
  /** Whether status is loading */
  isLoading: boolean;
  /** Error message if status fetch failed */
  error?: string | null;
  /** Callback when user confirms export */
  onExport: (format: "pptx" | "pdf", cardOrder: string[]) => void;
  /** Whether export is in progress */
  isExporting?: boolean;
}

export const BulkExportModal: React.FC<BulkExportModalProps> = ({
  isOpen,
  onClose,
  workstreamName,
  statusData,
  isLoading,
  error,
  onExport,
  isExporting = false,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<"pptx" | "pdf">("pptx");
  const [cardOrder, setCardOrder] = useState<string[]>([]);

  const { elapsedTime, showLongExportWarning } = useExportTimer(isExporting);
  const estimatedTotalTime = cardOrder.length * ESTIMATED_SECONDS_PER_CARD;

  useEffect(() => {
    if (statusData?.card_statuses) {
      const readyCards = statusData.card_statuses
        .filter((c) => c.has_brief && c.brief_status === "completed")
        .sort((a, b) => a.position - b.position)
        .map((c) => c.card_id);
      setCardOrder(readyCards);
    }
  }, [statusData]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isExporting) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isExporting, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isExporting) return;
    onClose();
  }, [isExporting, onClose]);

  const handleExport = useCallback(() => {
    if (cardOrder.length > 0) {
      onExport(selectedFormat, cardOrder);
    }
  }, [selectedFormat, cardOrder, onExport]);

  if (!isOpen) return null;

  const readyCount = statusData?.cards_ready ?? 0;
  const totalCount = statusData?.total_cards ?? 0;
  const allReady = readyCount === totalCount && totalCount > 0;
  const canExport = cardOrder.length > 0 && !isExporting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-export-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        className={cn(
          "relative w-full max-w-2xl mx-4",
          "bg-white dark:bg-dark-surface-deep rounded-xl shadow-2xl",
          "border border-gray-200 dark:border-gray-800",
          "transform transition-all duration-200",
          "max-h-[90vh] overflow-hidden flex flex-col",
        )}
      >
        <div
          className="px-6 py-4 border-b border-gray-200 dark:border-gray-800"
          style={{ backgroundColor: COA_COLORS.fadedWhite }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: COA_COLORS.lightBlue }}
              >
                <Presentation
                  className="h-5 w-5"
                  style={{ color: COA_COLORS.logoBlue }}
                />
              </div>
              <div>
                <h2
                  id="bulk-export-title"
                  className="text-lg font-semibold"
                  style={{ color: COA_COLORS.darkBlue }}
                >
                  Export Portfolio
                </h2>
                <p className="text-sm text-gray-500">{workstreamName}</p>
              </div>
            </div>
            {!isExporting && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2
                className="h-8 w-8 animate-spin mb-4"
                style={{ color: COA_COLORS.logoBlue }}
              />
              <p className="text-gray-500">Loading brief status...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle
                className="h-12 w-12 mb-4"
                style={{ color: COA_COLORS.red }}
              />
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
                Failed to load briefs
              </p>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "flex items-center gap-3 p-4 rounded-lg mb-6",
                  allReady
                    ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                    : "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800",
                )}
              >
                {allReady ? (
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                )}
                <div>
                  <p
                    className={cn(
                      "font-medium",
                      allReady
                        ? "text-green-700 dark:text-green-300"
                        : "text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {readyCount} of {totalCount} briefs ready
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {allReady
                      ? "All briefs are complete and ready for export."
                      : "Only signals with completed briefs will be included."}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Signals to Include
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span>Kanban order</span>
                  </div>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(statusData?.card_statuses ?? [])
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((card, index) => (
                      <CardStatusRow
                        key={card.card_id}
                        card={card}
                        index={index + 1}
                      />
                    ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Export Format
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <FormatOption
                    format="pptx"
                    title="PowerPoint"
                    description="AI-generated slides via Gamma.app"
                    icon={Presentation}
                    isSelected={selectedFormat === "pptx"}
                    onSelect={() => setSelectedFormat("pptx")}
                    isPowered
                  />
                  <FormatOption
                    format="pdf"
                    title="PDF Document"
                    description="Detailed written report"
                    icon={FileText}
                    isSelected={selectedFormat === "pdf"}
                    onSelect={() => setSelectedFormat("pdf")}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-dark-surface/50">
          {isExporting && (
            <ExportProgressIndicator
              elapsedTime={elapsedTime}
              estimatedTotalTime={estimatedTotalTime}
              showLongExportWarning={showLongExportWarning}
            />
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {!isExporting && cardOrder.length > 0 && (
                <span>
                  {cardOrder.length} card{cardOrder.length !== 1 ? "s" : ""}{" "}
                  will be exported
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                disabled={isExporting}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  "border border-gray-300 dark:border-gray-600",
                  "text-gray-700 dark:text-gray-300",
                  "hover:bg-gray-100 dark:hover:bg-gray-700",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={!canExport}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  "text-white",
                  canExport
                    ? "hover:opacity-90"
                    : "opacity-50 cursor-not-allowed",
                )}
                style={{
                  backgroundColor: canExport
                    ? COA_COLORS.logoBlue
                    : COA_COLORS.darkGray,
                }}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Export Portfolio</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkExportModal;
