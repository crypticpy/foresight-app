/**
 * CardActions Component
 *
 * A dropdown menu providing contextual actions for workstream kanban cards.
 * Includes navigation, notes editing, deep dive requests, column moves, and removal.
 *
 * Features:
 * - View card details navigation
 * - Add/edit notes with modal dialog
 * - Request deep dive analysis
 * - Move card to different kanban columns
 * - Remove card from workstream
 * - Dark mode support
 * - Keyboard navigation and accessibility
 */

import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  MoreVertical,
  Eye,
  StickyNote,
  ArrowRight,
  Trash2,
  X,
  ChevronRight,
  Loader2,
  FlaskConical,
  Zap,
  FileText,
  Presentation,
  RefreshCw,
  Mail,
  Link2,
  Briefcase,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  KANBAN_COLUMNS,
  type KanbanStatus,
  type WorkstreamCard,
} from "./types";
import { AddToPortfolioModal } from "../portfolios/AddToPortfolioModal";
import { getAuthToken } from "../../lib/auth";

// =============================================================================
// Types
// =============================================================================

export interface CardActionsProps {
  /** The workstream card to show actions for */
  card: WorkstreamCard;
  /** The parent workstream ID (for context) */
  workstreamId: string;
  /** Current column the card is in - determines available actions */
  columnId: KanbanStatus;
  /** Callback when notes are updated */
  onNotesUpdate: (cardId: string, notes: string) => void;
  /** Callback when deep dive is requested */
  onDeepDive: (cardId: string) => void;
  /** Callback when card is removed from workstream */
  onRemove: (cardId: string) => void;
  /** Callback when card is moved to a different column */
  onMoveToColumn: (cardId: string, status: KanbanStatus) => void;
  /** Callback for quick update action (screening column) */
  onQuickUpdate?: (cardId: string) => Promise<void>;
  /** Callback for export action (card export) */
  onExport?: (cardId: string, format: "pdf" | "pptx") => Promise<void>;
  /** Callback for exporting executive brief (brief column) */
  onExportBrief?: (cardId: string, format: "pdf" | "pptx") => Promise<void>;
  /** Callback for check updates action (watching column) */
  onCheckUpdates?: (cardId: string) => Promise<void>;
  /** Callback for generating an executive brief (brief column) */
  onGenerateBrief?: (workstreamCardId: string, cardId: string) => void;
  /** Callback to email the card via the user's mail client. */
  onShareCard?: (cardId: string) => Promise<void> | void;
  /** Callback to copy a public share URL for the card. */
  onCopyShareLink?: (cardId: string) => Promise<void> | void;
}

// =============================================================================
// Notes Modal Component
// =============================================================================

interface NotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (notes: string) => void;
  initialNotes: string;
  cardName: string;
  isSaving?: boolean;
}

/**
 * NotesModal - Modal dialog for adding/editing card notes.
 *
 * Provides a textarea for notes input with save/cancel actions.
 */
const NotesModal = memo(function NotesModal({
  isOpen,
  onClose,
  onSave,
  initialNotes,
  cardName,
  isSaving = false,
}: NotesModalProps) {
  const [notes, setNotes] = useState(initialNotes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Reset notes when modal opens with new initial value
  useEffect(() => {
    if (isOpen) {
      setNotes(initialNotes);
      // Focus textarea after brief delay for animation
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, initialNotes]);

  // Focus trap - keep focus within modal
  useEffect(() => {
    if (!isOpen) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleTabKey);
    return () => document.removeEventListener("keydown", handleTabKey);
  }, [isOpen]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSaving) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isSaving, onClose]);

  // Handle save
  const handleSave = useCallback(() => {
    onSave(notes.trim());
  }, [notes, onSave]);

  // Handle keyboard shortcut (Cmd/Ctrl + Enter to save)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSaving) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave, isSaving],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notes-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={isSaving ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-lg transform transition-all duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center gap-2 min-w-0">
            <StickyNote className="h-5 w-5 text-amber-500 shrink-0" />
            <h2
              id="notes-modal-title"
              className="text-lg font-semibold leading-snug text-gray-900 dark:text-white break-words"
            >
              {initialNotes ? "Edit Notes" : "Add Notes"}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Card Name Reference */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Signal:</span>{" "}
            <span className="text-gray-900 dark:text-white">{cardName}</span>
          </div>

          {/* Notes Textarea */}
          <div>
            <label
              htmlFor="card-notes"
              className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
            >
              Notes
            </label>
            <textarea
              ref={textareaRef}
              id="card-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add your notes about this signal..."
              disabled={isSaving}
              rows={6}
              className={cn(
                "w-full px-3 py-2 border rounded-md shadow-sm text-sm resize-none",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue",
                "dark:bg-dark-surface-elevated dark:text-white dark:placeholder-gray-400",
                "border-gray-300 bg-white dark:border-gray-600",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Press Cmd/Ctrl + Enter to save
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-600">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={saveButtonRef}
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              "inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface",
              "transition-colors",
              isSaving
                ? "bg-brand-blue/60 cursor-not-allowed"
                : "bg-brand-blue hover:bg-brand-dark-blue",
            )}
            aria-busy={isSaving}
          >
            {isSaving && (
              <Loader2
                className="h-4 w-4 mr-2 animate-spin"
                aria-hidden="true"
              />
            )}
            {isSaving ? "Saving..." : "Save Notes"}
          </button>
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Move Submenu Component
// =============================================================================

interface MoveSubmenuProps {
  currentStatus: KanbanStatus;
  onMove: (status: KanbanStatus) => void;
}

/**
 * MoveSubmenu - Submenu showing available columns to move card to.
 */
const MoveSubmenu = memo(function MoveSubmenu({
  currentStatus,
  onMove,
}: MoveSubmenuProps) {
  return (
    <div className="py-1">
      {KANBAN_COLUMNS.map((column) => {
        const isCurrentColumn = column.id === currentStatus;

        return (
          <button
            key={column.id}
            onClick={() => {
              if (!isCurrentColumn) {
                onMove(column.id);
              }
            }}
            disabled={isCurrentColumn}
            className={cn(
              "w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors",
              isCurrentColumn
                ? "text-gray-400 dark:text-gray-500 cursor-not-allowed bg-gray-50 dark:bg-dark-surface/50"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700",
            )}
          >
            <span className="flex-1">{column.title}</span>
            {isCurrentColumn && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                (current)
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

/**
 * CardActions - Dropdown menu with contextual actions for a kanban card.
 *
 * Provides a three-dot menu button that opens a dropdown with various
 * card management actions including navigation, notes, moves, and removal.
 * Shows column-specific actions based on which column the card is in.
 */
export const CardActions = memo(function CardActions({
  card,
  workstreamId,
  columnId: _columnId,
  onNotesUpdate,
  onDeepDive,
  onRemove,
  onMoveToColumn,
  onQuickUpdate,
  onExport,
  onExportBrief,
  onCheckUpdates,
  onGenerateBrief,
  onShareCard,
  onCopyShareLink,
}: CardActionsProps) {
  const navigate = useNavigate();

  // Dropdown state
  const [isOpen, setIsOpen] = useState(false);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const [_focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Notes modal state
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Loading states for column-specific actions
  const [isQuickUpdating, setIsQuickUpdating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  // Portfolio modal
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);

  const getPortfolioToken = useCallback(async (): Promise<string | null> => {
    return await getAuthToken();
  }, []);

  // Screen reader announcement for loading states
  const [srAnnouncement, setSrAnnouncement] = useState("");

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowMoveSubmenu(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "Escape":
          setIsOpen(false);
          setShowMoveSubmenu(false);
          setFocusedIndex(-1);
          buttonRef.current?.focus();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const menuItems = menuItemsRef.current.filter(Boolean);
            const next = prev < menuItems.length - 1 ? prev + 1 : 0;
            menuItems[next]?.focus();
            return next;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const menuItems = menuItemsRef.current.filter(Boolean);
            const next = prev > 0 ? prev - 1 : menuItems.length - 1;
            menuItems[next]?.focus();
            return next;
          });
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          menuItemsRef.current[0]?.focus();
          break;
        case "End": {
          e.preventDefault();
          const menuItems = menuItemsRef.current.filter(Boolean);
          setFocusedIndex(menuItems.length - 1);
          menuItems[menuItems.length - 1]?.focus();
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Toggle dropdown
  const toggleDropdown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
    setShowMoveSubmenu(false);
    setFocusedIndex(-1);
    menuItemsRef.current = [];
  }, []);

  // Handle view details
  const handleViewDetails = useCallback(() => {
    setIsOpen(false);
    navigate(`/signals/${card.card.slug}`);
  }, [navigate, card.card.slug]);

  // Handle notes action
  const handleNotesClick = useCallback(() => {
    setIsOpen(false);
    setIsNotesModalOpen(true);
  }, []);

  // Handle save notes
  const handleSaveNotes = useCallback(
    async (notes: string) => {
      setIsSavingNotes(true);
      try {
        await onNotesUpdate(card.id, notes);
        setIsNotesModalOpen(false);
      } finally {
        setIsSavingNotes(false);
      }
    },
    [card.id, onNotesUpdate],
  );

  // Handle deep dive
  const handleDeepDive = useCallback(() => {
    setIsOpen(false);
    onDeepDive(card.id);
  }, [card.id, onDeepDive]);

  // Handle quick update (screening column)
  const handleQuickUpdate = useCallback(async () => {
    if (!onQuickUpdate) return;
    setIsOpen(false);
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
  }, [card.id, onQuickUpdate]);

  // Handle export.
  // Export requires the actual card UUID (card.card.id), not the junction
  // table id (card.id). In v2 the "brief" column is gone — the brief is a
  // card attribute, so when a ready brief artifact exists we export it;
  // drafts still fall back to exporting the underlying card.
  const hasReadyBrief =
    (card.brief_status === "ready" || card.brief_status === "exported") &&
    Boolean(onExportBrief);
  const canExport = Boolean(onExport) || hasReadyBrief;
  const handleExport = useCallback(
    async (format: "pdf" | "pptx") => {
      const exportFn = hasReadyBrief ? onExportBrief : onExport;
      if (!exportFn) return;

      setIsOpen(false);
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
    [card.card.id, hasReadyBrief, onExport, onExportBrief],
  );

  // Handle check updates (watching column)
  const handleCheckUpdates = useCallback(async () => {
    if (!onCheckUpdates) return;
    setIsOpen(false);
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
  }, [card.id, onCheckUpdates]);

  // Handle generate brief (brief column)
  const handleGenerateBrief = useCallback(() => {
    if (!onGenerateBrief) return;
    setIsOpen(false);
    onGenerateBrief(card.id, card.card.id);
  }, [card.id, card.card.id, onGenerateBrief]);

  // Handle move to column
  const handleMoveToColumn = useCallback(
    (status: KanbanStatus) => {
      setIsOpen(false);
      setShowMoveSubmenu(false);
      onMoveToColumn(card.id, status);
    },
    [card.id, onMoveToColumn],
  );

  // Handle remove
  const handleRemove = useCallback(() => {
    setIsOpen(false);
    onRemove(card.id);
  }, [card.id, onRemove]);

  // Handle share-card (email handoff). Wired by the parent which fetches
  // the share-payload and opens `mailto:`.
  const handleShare = useCallback(() => {
    if (!onShareCard) return;
    setIsOpen(false);
    void onShareCard(card.id);
  }, [card.id, onShareCard]);

  // Handle copy-share-link (clipboard). Wired by the parent which fetches
  // the share-payload and writes the URL to navigator.clipboard.
  const handleCopyLink = useCallback(() => {
    if (!onCopyShareLink) return;
    setIsOpen(false);
    void onCopyShareLink(card.id);
  }, [card.id, onCopyShareLink]);

  // Disable per-card action buttons while any one of them is mid-flight.
  const isColumnActionLoading =
    isQuickUpdating || isExporting || isCheckingUpdates;
  const hasCardActions = Boolean(
    onQuickUpdate || onCheckUpdates || onGenerateBrief || canExport,
  );

  // Toggle move submenu
  const toggleMoveSubmenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMoveSubmenu((prev) => !prev);
  }, []);

  const hasExistingNotes = card.notes && card.notes.trim().length > 0;

  return (
    <>
      {/* Dropdown Container */}
      <div className="relative" ref={dropdownRef}>
        {/* Trigger Button */}
        <button
          ref={buttonRef}
          onClick={toggleDropdown}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
            "hover:bg-gray-100 dark:hover:bg-gray-700",
            "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-1 dark:focus:ring-offset-gray-800",
            isOpen &&
              "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
          )}
          aria-label="Signal actions"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div
            className={cn(
              "absolute right-0 mt-1 w-52 z-50",
              "bg-white dark:bg-dark-surface rounded-lg shadow-lg",
              "border border-gray-200 dark:border-gray-700",
              "py-1 overflow-hidden",
            )}
            role="menu"
            aria-orientation="vertical"
          >
            {/* Per-card actions — formerly column-specific, now always shown
                when the parent supplies the corresponding callback. */}
            {hasCardActions && (
              <>
                {onQuickUpdate && (
                  <button
                    onClick={handleQuickUpdate}
                    disabled={isColumnActionLoading}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                      "text-brand-blue dark:text-brand-light-blue",
                      "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                    role="menuitem"
                    title="Refresh with 5 quick sources"
                  >
                    {isQuickUpdating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    <span className="flex-1 text-left">Quick Update</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      5 sources
                    </span>
                  </button>
                )}
                <button
                  onClick={handleDeepDive}
                  disabled={isColumnActionLoading}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                    "text-brand-blue dark:text-brand-light-blue",
                    "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                  role="menuitem"
                  title="Run a deep research dive"
                >
                  <FlaskConical className="h-4 w-4" />
                  <span className="flex-1 text-left">Deep Dive</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    15 sources
                  </span>
                </button>
                {onGenerateBrief && (
                  <button
                    onClick={handleGenerateBrief}
                    disabled={isColumnActionLoading}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                      "text-brand-blue dark:text-brand-light-blue",
                      "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                    role="menuitem"
                    title="Generate an executive brief"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="flex-1 text-left">Generate Brief</span>
                  </button>
                )}
                {onCheckUpdates && (
                  <button
                    onClick={handleCheckUpdates}
                    disabled={isColumnActionLoading}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                      "text-brand-blue dark:text-brand-light-blue",
                      "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                    role="menuitem"
                    title="Check for new sources"
                  >
                    {isCheckingUpdates ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="flex-1 text-left">Check Updates</span>
                  </button>
                )}
                {canExport && (
                  <>
                    <button
                      onClick={() => handleExport("pdf")}
                      disabled={isColumnActionLoading}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        "text-brand-blue dark:text-brand-light-blue",
                        "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                      role="menuitem"
                      title={
                        hasReadyBrief
                          ? "Export brief as PDF"
                          : "Export card as PDF"
                      }
                    >
                      {isExporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      <span className="flex-1 text-left">Export PDF</span>
                    </button>
                    <button
                      onClick={() => handleExport("pptx")}
                      disabled={isColumnActionLoading}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        "text-brand-blue dark:text-brand-light-blue",
                        "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                      role="menuitem"
                      title={
                        hasReadyBrief
                          ? "Export brief as PowerPoint"
                          : "Export card as PowerPoint"
                      }
                    >
                      {isExporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Presentation className="h-4 w-4" />
                      )}
                      <span className="flex-1 text-left">Export PPTX</span>
                    </button>
                  </>
                )}
                {/* Divider after per-card actions */}
                <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
              </>
            )}

            {/* Universal Actions */}
            {/* View Details */}
            <button
              onClick={handleViewDetails}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              role="menuitem"
            >
              <Eye className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              View Details
            </button>

            {/* Add/Edit Notes */}
            <button
              onClick={handleNotesClick}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              role="menuitem"
            >
              <StickyNote className="h-4 w-4 text-amber-500" />
              {hasExistingNotes ? "Edit Notes" : "Add Notes"}
            </button>

            {/* Share Actions */}
            {(onShareCard || onCopyShareLink) && (
              <>
                <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                {onShareCard && (
                  <button
                    onClick={handleShare}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    role="menuitem"
                    title="Open your email client with a link to this card"
                  >
                    <Mail className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    Email this card
                  </button>
                )}
                {onCopyShareLink && (
                  <button
                    onClick={handleCopyLink}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    role="menuitem"
                    title="Copy a shareable link to your clipboard"
                  >
                    <Link2 className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    Copy share link
                  </button>
                )}
              </>
            )}

            {/* Divider */}
            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

            {/* Add to portfolio */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                setIsPortfolioModalOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              role="menuitem"
            >
              <Briefcase className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              Add to portfolio…
            </button>

            {/* Divider */}
            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

            {/* Move to... */}
            <div className="relative">
              <button
                onClick={toggleMoveSubmenu}
                className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={showMoveSubmenu}
              >
                <span className="flex items-center gap-3">
                  <ArrowRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  Move to...
                </span>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 text-gray-400 transition-transform",
                    showMoveSubmenu && "rotate-90",
                  )}
                />
              </button>

              {/* Move Submenu */}
              {showMoveSubmenu && (
                <div
                  className={cn(
                    "absolute left-full top-0 ml-1 w-44",
                    "bg-white dark:bg-dark-surface rounded-lg shadow-lg",
                    "border border-gray-200 dark:border-gray-700",
                    "overflow-hidden",
                  )}
                >
                  <MoveSubmenu
                    currentStatus={card.status}
                    onMove={handleMoveToColumn}
                  />
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

            {/* Remove from Workstream */}
            <button
              onClick={handleRemove}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              role="menuitem"
            >
              <Trash2 className="h-4 w-4" />
              Remove from Workstream
            </button>
          </div>
        )}
      </div>

      {/* Notes Modal */}
      <NotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onSave={handleSaveNotes}
        initialNotes={card.notes || ""}
        cardName={card.card.name}
        isSaving={isSavingNotes}
      />

      {/* Add to Portfolio Modal */}
      <AddToPortfolioModal
        isOpen={isPortfolioModalOpen}
        onClose={() => setIsPortfolioModalOpen(false)}
        cardId={card.card_id}
        cardName={card.card.name}
        workstreamId={workstreamId}
        getAuthToken={getPortfolioToken}
        onAdded={() => {
          setIsPortfolioModalOpen(false);
        }}
      />

      {/* Screen reader announcements for loading states */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {srAnnouncement}
      </div>
    </>
  );
});

export default CardActions;
