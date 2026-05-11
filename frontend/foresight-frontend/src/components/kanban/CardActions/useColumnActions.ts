/**
 * Wraps the parent-supplied async callbacks (`onQuickUpdate`,
 * `onExport`/`onExportBrief`, `onCheckUpdates`) with loading state and
 * a screen-reader announcement string. Resolves which export callback
 * to use based on whether the card has a ready brief artifact.
 *
 * @module components/kanban/CardActions/useColumnActions
 */

import { useCallback, useState } from "react";
import type { WorkstreamCard } from "../types";

export interface UseColumnActionsInput {
  card: WorkstreamCard;
  onQuickUpdate: ((cardId: string) => Promise<unknown>) | undefined;
  onExport:
    | ((cardId: string, format: "pdf" | "pptx") => Promise<unknown>)
    | undefined;
  onExportBrief:
    | ((cardId: string, format: "pdf" | "pptx") => Promise<unknown>)
    | undefined;
  onCheckUpdates: ((cardId: string) => Promise<void>) | undefined;
  closeDropdown: () => void;
}

export interface UseColumnActionsResult {
  isQuickUpdating: boolean;
  isExporting: boolean;
  isCheckingUpdates: boolean;
  isColumnActionLoading: boolean;
  srAnnouncement: string;
  hasReadyBrief: boolean;
  canExport: boolean;
  handleQuickUpdate: () => Promise<void>;
  handleExport: (format: "pdf" | "pptx") => Promise<void>;
  handleCheckUpdates: () => Promise<void>;
}

export function useColumnActions({
  card,
  onQuickUpdate,
  onExport,
  onExportBrief,
  onCheckUpdates,
  closeDropdown,
}: UseColumnActionsInput): UseColumnActionsResult {
  const [isQuickUpdating, setIsQuickUpdating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [srAnnouncement, setSrAnnouncement] = useState("");

  const hasReadyBrief =
    (card.brief_status === "ready" || card.brief_status === "exported") &&
    Boolean(onExportBrief);
  const canExport = Boolean(onExport) || hasReadyBrief;

  const handleQuickUpdate = useCallback(async () => {
    if (!onQuickUpdate) return;
    closeDropdown();
    setIsQuickUpdating(true);
    setSrAnnouncement("Starting quick update...");
    try {
      await onQuickUpdate(card.id);
      setSrAnnouncement("Quick update completed");
    } catch {
      setSrAnnouncement("Quick update failed");
    } finally {
      setIsQuickUpdating(false);
    }
  }, [card.id, onQuickUpdate, closeDropdown]);

  const handleExport = useCallback(
    async (format: "pdf" | "pptx") => {
      // Export requires the actual card UUID (card.card.id), not the
      // junction-table id (card.id). The "brief" column is gone in v2 —
      // the brief is a card attribute, so when a ready brief artifact
      // exists we export it; drafts fall back to the card export.
      const exportFn = hasReadyBrief ? onExportBrief : onExport;
      if (!exportFn) return;

      closeDropdown();
      setIsExporting(true);
      const exportType = hasReadyBrief ? "Brief" : "";
      setSrAnnouncement(
        `Exporting ${exportType} as ${format.toUpperCase()}...`,
      );
      try {
        await exportFn(card.card.id, format);
        setSrAnnouncement(
          `${exportType} ${format.toUpperCase()} export completed`,
        );
      } catch {
        setSrAnnouncement(
          `${exportType} ${format.toUpperCase()} export failed`,
        );
      } finally {
        setIsExporting(false);
      }
    },
    [card.card.id, hasReadyBrief, onExport, onExportBrief, closeDropdown],
  );

  const handleCheckUpdates = useCallback(async () => {
    if (!onCheckUpdates) return;
    closeDropdown();
    setIsCheckingUpdates(true);
    setSrAnnouncement("Checking for updates...");
    try {
      await onCheckUpdates(card.id);
      setSrAnnouncement("Update check completed");
    } catch {
      setSrAnnouncement("Update check failed");
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [card.id, onCheckUpdates, closeDropdown]);

  const isColumnActionLoading =
    isQuickUpdating || isExporting || isCheckingUpdates;

  return {
    isQuickUpdating,
    isExporting,
    isCheckingUpdates,
    isColumnActionLoading,
    srAnnouncement,
    hasReadyBrief,
    canExport,
    handleQuickUpdate,
    handleExport,
    handleCheckUpdates,
  };
}
