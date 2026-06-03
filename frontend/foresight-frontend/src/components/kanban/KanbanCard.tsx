/**
 * Draggable card for the workstream kanban board. Owns drag-sortable
 * wiring, hover state for the keyboard hot-keys, and click navigation.
 * Visual sub-pieces (tooltip body, research indicator, inbox quick
 * actions) live in `./KanbanCard/`.
 *
 * @module components/kanban/KanbanCard
 */

import React, { memo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Bell,
  Check,
  Eye,
  EyeOff,
  GripHorizontal,
  StickyNote,
} from "lucide-react";

import { cn } from "../../lib/utils";
import { PillarBadge } from "../PillarBadge";
import { HorizonBadge } from "../HorizonBadge";
import { StageBadge } from "../StageBadge";
import { Top25Badge } from "../Top25Badge";
import { QualityBadge } from "../QualityBadge";
import { VelocityBadge, type VelocityTrend } from "../VelocityBadge";
import { ExploratoryBadge } from "../badges/ExploratoryBadge";
import { Tooltip } from "../ui/Tooltip";
import { CardActions } from "./CardActions";
import type {
  CardActionCallbacks,
  KanbanStatus,
  WorkstreamCard as WorkstreamCardType,
} from "./types";

import { AddedFromTooltipContent } from "./KanbanCard/AddedFromTooltipContent";
import { ArtifactStrip } from "./KanbanCard/ArtifactStrip";
import { InboxQuickActions } from "./KanbanCard/InboxQuickActions";
import { getAccentBorderClass, parseStageNumber } from "./KanbanCard/helpers";
import { useQuickTriageKeyboard } from "./KanbanCard/useQuickTriageKeyboard";

export interface KanbanCardProps {
  /** The workstream card data to display */
  card: WorkstreamCardType;
  /** The parent workstream ID (for CardActions) */
  workstreamId?: string;
  /** The column ID this card is in (for column-specific actions) */
  columnId?: KanbanStatus;
  /** Whether the card is currently being dragged (for overlay) */
  isDragOverlay?: boolean;
  /** When true, drag-and-drop is disabled (org-owned read-only workstreams). */
  readOnly?: boolean;
  /** Optional callback when card is clicked */
  onCardClick?: (card: WorkstreamCardType) => void;
  /** Optional card action callbacks */
  cardActions?: CardActionCallbacks;
  /** Whether this card is part of the current bulk-action selection. */
  isSelected?: boolean;
  /** Toggle this card's selection in the bulk-action set. */
  onToggleSelect?: (cardId: string) => void;
}

export const KanbanCard = memo(function KanbanCard({
  card,
  workstreamId,
  columnId,
  isDragOverlay = false,
  readOnly = false,
  onCardClick,
  cardActions,
  isSelected = false,
  onToggleSelect,
}: KanbanCardProps) {
  const navigate = useNavigate();

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    disabled: isDragOverlay || readOnly,
    data: { type: "card", card },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { card: embeddedCard } = card;
  const stageNumber = parseStageNumber(embeddedCard.stage_id);
  const hasNotes = card.notes && card.notes.trim().length > 0;
  const hasReminder = card.reminder_at !== null;

  const [isApproved, setIsApproved] = useState(false);
  const showNeedsReview =
    card.review_status === "pending_review" && !isApproved;

  // Optimistic state for the watching toggle so the chip flips instantly
  // even before the server round-trip resolves.
  const [optimisticWatching, setOptimisticWatching] = useState<boolean | null>(
    null,
  );
  const isWatching = optimisticWatching ?? card.is_watching;

  const handleToggleWatching = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardActions?.onToggleWatching) return;
    const next = !isWatching;
    setOptimisticWatching(next);
    try {
      await cardActions.onToggleWatching(card.id, next);
    } catch {
      setOptimisticWatching(null);
    }
  };

  const [isHovered, setIsHovered] = useState(false);
  useQuickTriageKeyboard({
    cardId: card.id,
    isHovered,
    columnId,
    isDragOverlay,
    cardActions,
    isWatching,
    setOptimisticWatching,
  });

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      return;
    }
    if (onCardClick) {
      onCardClick(card);
    } else {
      navigate(`/signals/${embeddedCard.slug}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (onCardClick) {
        onCardClick(card);
      } else {
        navigate(`/signals/${embeddedCard.slug}`);
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      // `listeners` (pointer/touch activation) stays on the whole card so it
      // remains draggable by mouse or touch from anywhere. We intentionally do
      // NOT spread `attributes` here — that would make the card root a second
      // focusable role="button" nested around the content button below (a WCAG
      // 4.1.2 violation). Keyboard drag is wired to the dedicated grip handle.
      {...listeners}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative bg-white dark:bg-dark-surface rounded-lg shadow-sm",
        "border border-gray-200 dark:border-gray-700",
        "border-l-4",
        getAccentBorderClass(embeddedCard.horizon),
        "transition-all duration-200",
        "hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600",
        isDragging && "opacity-50 shadow-lg ring-2 ring-brand-blue/50",
        isDragOverlay && "shadow-xl scale-105 rotate-2 cursor-grabbing",
        isSelected &&
          "ring-2 ring-brand-blue ring-offset-1 dark:ring-offset-dark-surface-deep",
        "touch-none cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Selection checkbox — top-left. Always visible once any card is
          selected, otherwise revealed on hover so cards stay clean. */}
      {onToggleSelect && !isDragOverlay && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(card.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-all",
            isSelected
              ? "bg-brand-blue border-brand-blue text-white opacity-100"
              : "bg-white dark:bg-dark-surface border-gray-300 dark:border-gray-600 text-transparent opacity-0 group-hover:opacity-100 hover:border-brand-blue",
          )}
          role="checkbox"
          aria-checked={isSelected}
          aria-label={isSelected ? "Deselect card" : "Select card"}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      )}

      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-0.5 z-10",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          isDragOverlay && "opacity-100",
        )}
      >
        {cardActions && workstreamId && columnId && !isDragOverlay && (
          <CardActions
            card={card}
            workstreamId={workstreamId}
            columnId={columnId}
            onNotesUpdate={cardActions.onNotesUpdate}
            onDeepDive={cardActions.onDeepDive}
            onRemove={cardActions.onRemove}
            onMoveToColumn={cardActions.onMoveToColumn}
            onQuickUpdate={cardActions.onQuickUpdate}
            onExport={cardActions.onExport}
            onExportBrief={cardActions.onExportBrief}
            onCheckUpdates={cardActions.onCheckUpdates}
            onGenerateBrief={cardActions.onGenerateBrief}
            onShareCard={cardActions.onShareCard}
            onCopyShareLink={cardActions.onCopyShareLink}
          />
        )}
      </div>

      {/* Dedicated drag handle — the keyboard-accessible activator. Mouse and
          touch users can still drag the whole card (listeners on the root); the
          handle gives keyboard users a focusable target that lifts the card on
          space/enter, moves it with the arrow keys, and cancels on escape.
          `setActivatorNodeRef` + dnd-kit's `attributes` provide the correct
          ARIA (role, describedby, roledescription) for assistive tech. */}
      {!isDragOverlay && !readOnly && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          // Only the keyboard activator goes on the handle. Spreading the full
          // `listeners` would also bind pointer activation here, double-firing
          // against the root's pointer drag. dnd-kit types these as `Function`.
          onKeyDown={
            listeners?.onKeyDown as
              | React.KeyboardEventHandler<HTMLButtonElement>
              | undefined
          }
          aria-label={`Reorder "${embeddedCard.name}". Press space or enter to pick it up, then use the arrow keys to move it between columns.`}
          className={cn(
            "absolute top-1 left-1/2 -translate-x-1/2 z-20",
            "flex h-5 w-8 items-center justify-center rounded",
            "text-gray-400 dark:text-gray-500",
            "cursor-grab active:cursor-grabbing touch-none",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            "hover:bg-gray-100 dark:hover:bg-dark-surface-elevated",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
          )}
        >
          <GripHorizontal className="h-4 w-4" />
        </button>
      )}

      <div
        data-kanban-card={card.id}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        className="p-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-inset rounded-lg"
      >
        <h4
          className={cn(
            "text-sm font-medium leading-snug text-gray-900 dark:text-white mb-2 pr-9 break-words",
            // Reserve room for the absolutely-positioned selection checkbox
            // (top-2 left-2, w-5) so its hover/selected state never lands on
            // the first word of the title.
            onToggleSelect && "pl-6",
          )}
        >
          {embeddedCard.name}
        </h4>

        {embeddedCard.summary && (
          <p
            title={embeddedCard.summary}
            className={cn(
              "text-xs text-gray-500 dark:text-gray-400 leading-snug line-clamp-2 mb-2",
              onToggleSelect && "pl-6",
            )}
          >
            {embeddedCard.summary}
          </p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <PillarBadge
            pillarId={embeddedCard.pillar_id}
            size="sm"
            showIcon={false}
            disableTooltip={isDragOverlay}
          />
          {embeddedCard.is_exploratory && <ExploratoryBadge size="sm" />}
          <HorizonBadge
            horizon={embeddedCard.horizon}
            size="sm"
            disableTooltip={isDragOverlay}
          />
          {stageNumber !== null && (
            <StageBadge
              stage={stageNumber}
              size="sm"
              variant="minimal"
              disableTooltip={isDragOverlay}
            />
          )}
          {embeddedCard.signal_quality_score != null && (
            <QualityBadge score={embeddedCard.signal_quality_score} size="sm" />
          )}
          <VelocityBadge
            trend={embeddedCard.velocity_trend as VelocityTrend}
            score={embeddedCard.velocity_score}
          />
        </div>

        {showNeedsReview && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
              <AlertCircle className="h-3 w-3" />
              Needs Review
            </span>
          </div>
        )}

        {embeddedCard.top25_relevance &&
          embeddedCard.top25_relevance.length > 0 && (
            <div className="mb-2">
              <Top25Badge
                priorities={embeddedCard.top25_relevance}
                size="sm"
                showCount
              />
            </div>
          )}

        <ArtifactStrip
          artifacts={embeddedCard.artifacts}
          isDragOverlay={isDragOverlay}
        />

        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          {cardActions?.onToggleWatching && !isDragOverlay && (
            <Tooltip
              content={isWatching ? "Stop watching" : "Watch this card"}
              side="top"
              disabled={isDragOverlay}
            >
              <button
                type="button"
                onClick={handleToggleWatching}
                className={cn(
                  "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors",
                  isWatching
                    ? "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 hover:bg-pink-100 dark:hover:bg-pink-900/40"
                    : "text-gray-400 dark:text-gray-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20",
                )}
                aria-pressed={isWatching}
                aria-label={isWatching ? "Stop watching" : "Watch this card"}
              >
                {isWatching ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
              </button>
            </Tooltip>
          )}

          {hasNotes && (
            <div
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
              title="Has notes"
            >
              <StickyNote className="h-3 w-3" />
              <span className="sr-only">Has notes</span>
            </div>
          )}

          {hasReminder && (
            <div
              className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
              title="Reminder set"
            >
              <Bell className="h-3 w-3" />
              <span className="sr-only">Reminder set</span>
            </div>
          )}

          <Tooltip
            content={
              <AddedFromTooltipContent
                addedFrom={card.added_from as "auto" | "manual" | "follow"}
                card={embeddedCard}
              />
            }
            side="top"
            align="end"
            contentClassName="p-2"
            disabled={isDragOverlay}
          >
            <span
              className={cn(
                "ml-auto text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded cursor-help",
                card.added_from === "auto" &&
                  "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
                card.added_from === "manual" &&
                  "bg-gray-50 text-gray-500 dark:bg-dark-surface dark:text-gray-400",
                card.added_from === "follow" &&
                  "bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
              )}
            >
              {card.added_from}
            </span>
          </Tooltip>
        </div>

        {columnId === "inbox" &&
          cardActions?.onMoveToColumn &&
          !isDragOverlay && (
            <InboxQuickActions
              cardId={card.id}
              isDragOverlay={isDragOverlay}
              showNeedsReview={showNeedsReview}
              cardActions={cardActions}
              onApproveLocal={() => setIsApproved(true)}
            />
          )}
      </div>
    </div>
  );
});

export default KanbanCard;
