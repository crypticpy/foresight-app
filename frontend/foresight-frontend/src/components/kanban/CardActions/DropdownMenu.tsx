/**
 * The dropdown panel JSX for CardActions: per-card async actions
 * (quick update, deep dive, generate/export brief, check updates),
 * universal actions (view details, notes, share, add to portfolio,
 * move, remove). The parent owns all state — this component is pure
 * presentation.
 *
 * @module components/kanban/CardActions/DropdownMenu
 */

import React from "react";
import {
  ArrowRight,
  Briefcase,
  ChevronRight,
  Eye,
  FileText,
  FlaskConical,
  Link2,
  Loader2,
  Mail,
  Presentation,
  RefreshCw,
  StickyNote,
  Trash2,
  Zap,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import type { KanbanStatus, WorkstreamCard } from "../types";
import { MoveSubmenu } from "./MoveSubmenu";

export interface DropdownMenuProps {
  card: WorkstreamCard;

  // Per-card actions
  onQuickUpdate: (() => Promise<void> | void) | undefined;
  onDeepDive: () => void;
  onGenerateBrief: (() => void) | undefined;
  onCheckUpdates: (() => Promise<void> | void) | undefined;
  onExport: ((format: "pdf" | "pptx") => Promise<void> | void) | undefined;

  // Loading flags
  isQuickUpdating: boolean;
  isExporting: boolean;
  isCheckingUpdates: boolean;
  isColumnActionLoading: boolean;
  hasReadyBrief: boolean;
  canExport: boolean;

  // Universal actions
  onViewDetails: () => void;
  onNotesClick: () => void;
  hasExistingNotes: boolean;
  onShare: (() => void) | undefined;
  onCopyLink: (() => void) | undefined;
  onOpenPortfolioModal: (e: React.MouseEvent) => void;

  // Move
  showMoveSubmenu: boolean;
  onToggleMoveSubmenu: (e: React.MouseEvent) => void;
  onMoveToColumn: (status: KanbanStatus) => void;

  // Remove
  onRemove: () => void;
}

export function DropdownMenu({
  card,
  onQuickUpdate,
  onDeepDive,
  onGenerateBrief,
  onCheckUpdates,
  onExport,
  isQuickUpdating,
  isExporting,
  isCheckingUpdates,
  isColumnActionLoading,
  hasReadyBrief,
  canExport,
  onViewDetails,
  onNotesClick,
  hasExistingNotes,
  onShare,
  onCopyLink,
  onOpenPortfolioModal,
  showMoveSubmenu,
  onToggleMoveSubmenu,
  onMoveToColumn,
  onRemove,
}: DropdownMenuProps) {
  const hasCardActions = Boolean(
    onQuickUpdate || onCheckUpdates || onGenerateBrief || canExport,
  );

  return (
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
      {hasCardActions && (
        <>
          {onQuickUpdate && (
            <button
              onClick={() => void onQuickUpdate()}
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
            onClick={onDeepDive}
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
              onClick={onGenerateBrief}
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
              onClick={() => void onCheckUpdates()}
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
          {canExport && onExport && (
            <>
              <button
                onClick={() => void onExport("pdf")}
                disabled={isColumnActionLoading}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                  "text-brand-blue dark:text-brand-light-blue",
                  "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
                role="menuitem"
                title={
                  hasReadyBrief ? "Export brief as PDF" : "Export card as PDF"
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
                onClick={() => void onExport("pptx")}
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
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
        </>
      )}

      <button
        onClick={onViewDetails}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        role="menuitem"
      >
        <Eye className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        View Details
      </button>

      <button
        onClick={onNotesClick}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        role="menuitem"
      >
        <StickyNote className="h-4 w-4 text-amber-500" />
        {hasExistingNotes ? "Edit Notes" : "Add Notes"}
      </button>

      {(onShare || onCopyLink) && (
        <>
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
          {onShare && (
            <button
              onClick={onShare}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              role="menuitem"
              title="Open your email client with a link to this card"
            >
              <Mail className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              Email this card
            </button>
          )}
          {onCopyLink && (
            <button
              onClick={onCopyLink}
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

      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

      <button
        onClick={onOpenPortfolioModal}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        role="menuitem"
      >
        <Briefcase className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        Add to portfolio…
      </button>

      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

      <div className="relative">
        <button
          onClick={onToggleMoveSubmenu}
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

        {showMoveSubmenu && (
          <div
            className={cn(
              "absolute left-full top-0 ml-1 w-44",
              "bg-white dark:bg-dark-surface rounded-lg shadow-lg",
              "border border-gray-200 dark:border-gray-700",
              "overflow-hidden",
            )}
          >
            <MoveSubmenu currentStatus={card.status} onMove={onMoveToColumn} />
          </div>
        )}
      </div>

      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

      <button
        onClick={onRemove}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        role="menuitem"
      >
        <Trash2 className="h-4 w-4" />
        Remove from Workstream
      </button>
    </div>
  );
}
