/**
 * Dropdown menu providing contextual actions for a workstream kanban
 * card: view details, edit notes, deep dive, quick update, export,
 * generate/export brief, check updates, share, add to portfolio, move
 * between columns, and remove from the workstream.
 *
 * This file is the slim composer that wires together the focused
 * sub-modules in `./CardActions/` — the dropdown-state hook, the
 * async column-action hook, the NotesModal, and the DropdownMenu
 * presentation component.
 *
 * @module components/kanban/CardActions
 */

import { memo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreVertical } from "lucide-react";
import { cn } from "../../lib/utils";
import type { KanbanStatus, WorkstreamCard } from "./types";
import { AddToPortfolioModal } from "../portfolios/AddToPortfolioModal";
import { getAuthToken } from "../../lib/auth";

import { NotesModal } from "./CardActions/NotesModal";
import { DropdownMenu } from "./CardActions/DropdownMenu";
import { useDropdownState } from "./CardActions/useDropdownState";
import { useColumnActions } from "./CardActions/useColumnActions";

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
  onQuickUpdate?: (cardId: string) => Promise<unknown>;
  /** Callback for export action (card export) */
  onExport?: (cardId: string, format: "pdf" | "pptx") => Promise<unknown>;
  /** Callback for exporting executive brief (brief column) */
  onExportBrief?: (cardId: string, format: "pdf" | "pptx") => Promise<unknown>;
  /** Callback for check updates action (watching column) */
  onCheckUpdates?: (cardId: string) => Promise<void>;
  /** Callback for generating an executive brief (brief column) */
  onGenerateBrief?: (workstreamCardId: string, cardId: string) => void;
  /** Callback to email the card via the user's mail client. */
  onShareCard?: (cardId: string) => Promise<void> | void;
  /** Callback to copy a public share URL for the card. */
  onCopyShareLink?: (cardId: string) => Promise<void> | void;
}

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

  const dropdown = useDropdownState();

  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);

  const getPortfolioToken = useCallback(
    async (): Promise<string | null> => await getAuthToken(),
    [],
  );

  const column = useColumnActions({
    card,
    onQuickUpdate,
    onExport,
    onExportBrief,
    onCheckUpdates,
    closeDropdown: dropdown.closeDropdown,
  });

  const handleViewDetails = useCallback(() => {
    dropdown.closeDropdown();
    navigate(`/signals/${card.card.slug}`);
  }, [navigate, card.card.slug, dropdown]);

  const handleNotesClick = useCallback(() => {
    dropdown.closeDropdown();
    setIsNotesModalOpen(true);
  }, [dropdown]);

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

  const handleDeepDive = useCallback(() => {
    dropdown.closeDropdown();
    onDeepDive(card.id);
  }, [card.id, onDeepDive, dropdown]);

  const handleGenerateBrief = useCallback(() => {
    if (!onGenerateBrief) return;
    dropdown.closeDropdown();
    onGenerateBrief(card.id, card.card.id);
  }, [card.id, card.card.id, onGenerateBrief, dropdown]);

  const handleMoveToColumn = useCallback(
    (status: KanbanStatus) => {
      dropdown.closeDropdown();
      onMoveToColumn(card.id, status);
    },
    [card.id, onMoveToColumn, dropdown],
  );

  const handleRemove = useCallback(() => {
    dropdown.closeDropdown();
    onRemove(card.id);
  }, [card.id, onRemove, dropdown]);

  // Share-card and copy-share-link defer to the parent which fetches
  // the share payload and either opens `mailto:` or writes the URL to
  // the clipboard.
  const handleShare = useCallback(() => {
    if (!onShareCard) return;
    dropdown.closeDropdown();
    void onShareCard(card.id);
  }, [card.id, onShareCard, dropdown]);

  const handleCopyLink = useCallback(() => {
    if (!onCopyShareLink) return;
    dropdown.closeDropdown();
    void onCopyShareLink(card.id);
  }, [card.id, onCopyShareLink, dropdown]);

  const handleOpenPortfolioModal = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dropdown.closeDropdown();
      setIsPortfolioModalOpen(true);
    },
    [dropdown],
  );

  const hasExistingNotes = Boolean(card.notes && card.notes.trim().length > 0);

  return (
    <>
      <div className="relative" ref={dropdown.dropdownRef}>
        <button
          ref={dropdown.buttonRef}
          onClick={dropdown.toggleDropdown}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
            "hover:bg-gray-100 dark:hover:bg-gray-700",
            "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-1 dark:focus:ring-offset-gray-800",
            dropdown.isOpen &&
              "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
          )}
          aria-label="Signal actions"
          aria-haspopup="true"
          aria-expanded={dropdown.isOpen}
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {dropdown.isOpen && (
          <DropdownMenu
            card={card}
            onQuickUpdate={onQuickUpdate ? column.handleQuickUpdate : undefined}
            onDeepDive={handleDeepDive}
            onGenerateBrief={onGenerateBrief ? handleGenerateBrief : undefined}
            onCheckUpdates={
              onCheckUpdates ? column.handleCheckUpdates : undefined
            }
            onExport={column.canExport ? column.handleExport : undefined}
            isQuickUpdating={column.isQuickUpdating}
            isExporting={column.isExporting}
            isCheckingUpdates={column.isCheckingUpdates}
            isColumnActionLoading={column.isColumnActionLoading}
            hasReadyBrief={column.hasReadyBrief}
            canExport={column.canExport}
            onViewDetails={handleViewDetails}
            onNotesClick={handleNotesClick}
            hasExistingNotes={hasExistingNotes}
            onShare={onShareCard ? handleShare : undefined}
            onCopyLink={onCopyShareLink ? handleCopyLink : undefined}
            onOpenPortfolioModal={handleOpenPortfolioModal}
            showMoveSubmenu={dropdown.showMoveSubmenu}
            onToggleMoveSubmenu={dropdown.toggleMoveSubmenu}
            onMoveToColumn={handleMoveToColumn}
            onRemove={handleRemove}
          />
        )}
      </div>

      <NotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onSave={handleSaveNotes}
        initialNotes={card.notes || ""}
        cardName={card.card.name}
        isSaving={isSavingNotes}
      />

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

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {column.srAnnouncement}
      </div>
    </>
  );
});

export default CardActions;
