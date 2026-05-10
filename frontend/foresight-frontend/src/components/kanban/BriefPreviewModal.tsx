/**
 * Modal that displays a generated executive brief and exposes
 * regenerate / load-other-version / export-PDF / export-PPTX
 * affordances. Lifecycle, focus-trap, and Escape handling live in
 * `useModalA11y`; render-state branches and the brief body live in
 * `./BriefPreviewModal/`. This file owns the chrome (header + footer)
 * and the dispatch between loading / error / empty / content states.
 *
 * @module components/kanban/BriefPreviewModal
 */

import React, { memo, useCallback } from "react";
import {
  Download,
  FileText,
  Presentation,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "../../lib/utils";

import { BriefContent } from "./BriefPreviewModal/BriefContent";
import { ErrorState, LoadingState } from "./BriefPreviewModal/states";
import { VersionHistoryPanel } from "./BriefPreviewModal/VersionHistoryPanel";
import { useModalA11y } from "./BriefPreviewModal/useModalA11y";
import type {
  BriefPreviewModalProps,
  ExecutiveBrief,
} from "./BriefPreviewModal/types";

export type { BriefPreviewModalProps, ExecutiveBrief };

export const BriefPreviewModal = memo(function BriefPreviewModal({
  isOpen,
  onClose,
  brief,
  isGenerating,
  error,
  onExportPdf,
  onExportPptx,
  cardName,
  onRetry,
  versions = [],
  newSourcesCount = 0,
  onRegenerateBrief,
  onLoadVersion,
  isLoadingVersions = false,
}: BriefPreviewModalProps) {
  const { modalRef, closeButtonRef } = useModalA11y(isOpen, onClose);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  const hasBrief = brief !== null && !isGenerating && !error;
  const canExport = hasBrief;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="brief-modal-title"
      onClick={handleBackdropClick}
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        className={cn(
          "relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl",
          "w-full max-w-3xl max-h-[90vh] flex flex-col",
          "transform transition-all duration-200",
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className="p-2 rounded-lg bg-brand-blue/10 dark:bg-brand-blue/20"
              aria-hidden="true"
            >
              <FileText className="h-5 w-5 text-brand-blue dark:text-brand-light-blue" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2 flex-wrap">
                <h2
                  id="brief-modal-title"
                  className="text-lg font-semibold leading-snug text-gray-900 dark:text-white break-words"
                >
                  Executive Brief
                </h2>
                {brief?.version && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue dark:text-brand-light-blue rounded-full">
                    v{brief.version}
                  </span>
                )}
              </div>
              <p className="text-sm leading-snug text-gray-500 dark:text-gray-400 break-words">
                {cardName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasBrief && onRegenerateBrief && (
              <button
                onClick={onRegenerateBrief}
                disabled={isGenerating}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                  "text-gray-700 dark:text-gray-200",
                  "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600",
                  "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 dark:focus:ring-offset-dark-surface",
                  isGenerating && "opacity-50 cursor-not-allowed",
                )}
                aria-label="Regenerate brief with latest sources"
              >
                <RefreshCw
                  className={cn("h-4 w-4", isGenerating && "animate-spin")}
                />
                <span className="hidden sm:inline">Regenerate</span>
                {newSourcesCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                    <Sparkles className="h-3 w-3" />
                    {newSourcesCount} new
                  </span>
                )}
              </button>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={cn(
                "p-2 rounded-lg transition-colors",
                "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 dark:focus:ring-offset-dark-surface",
              )}
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isGenerating && <LoadingState />}

          {error && !isGenerating && (
            <ErrorState error={error} onRetry={onRetry} />
          )}

          {hasBrief && (
            <div className="space-y-6">
              <BriefContent brief={brief} />

              {versions.length > 1 && onLoadVersion && (
                <VersionHistoryPanel
                  versions={versions}
                  currentBriefId={brief.id}
                  onLoadVersion={onLoadVersion}
                  isLoading={isLoadingVersions}
                />
              )}
            </div>
          )}

          {!brief && !isGenerating && !error && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <FileText
                className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4"
                aria-hidden="true"
              />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No Brief Available
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Generate a brief from the card actions menu.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-600 flex-shrink-0 bg-gray-50 dark:bg-dark-surface">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              "text-gray-700 dark:text-gray-300",
              "bg-white dark:bg-dark-surface-elevated",
              "border border-gray-300 dark:border-gray-600",
              "hover:bg-gray-50 dark:hover:bg-dark-surface-hover",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 dark:focus:ring-offset-dark-surface-deep",
            )}
          >
            Close
          </button>
          <button
            type="button"
            onClick={onExportPptx}
            disabled={!canExport}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 dark:focus:ring-offset-dark-surface-deep",
              canExport
                ? "text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-surface-elevated border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-dark-surface-hover"
                : "text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 cursor-not-allowed",
            )}
          >
            <Presentation className="h-4 w-4" aria-hidden="true" />
            Export PPTX
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            disabled={!canExport}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-offset-2",
              canExport
                ? "text-white bg-brand-blue hover:bg-brand-dark-blue focus:ring-brand-blue dark:focus:ring-offset-dark-surface-deep"
                : "text-gray-400 bg-brand-blue/40 cursor-not-allowed focus:ring-brand-blue/50 dark:focus:ring-offset-dark-surface-deep",
            )}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
});

export default BriefPreviewModal;
