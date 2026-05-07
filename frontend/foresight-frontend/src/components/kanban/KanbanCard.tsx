/**
 * KanbanCard Component
 *
 * A draggable card component for the workstream kanban board.
 * Uses @dnd-kit/sortable for drag-and-drop functionality.
 *
 * Features:
 * - Draggable with smooth visual feedback
 * - Displays card metadata with badge components
 * - Notes and reminder indicators
 * - Click navigation to card detail view
 * - Dark mode support
 */

import React, { memo, useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import {
  StickyNote,
  Bell,
  Sparkles,
  UserPlus,
  Heart,
  Check,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  FileText,
  Zap,
  FlaskConical,
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
import { getPillarByCode } from "../../data/taxonomy";
import { formatRelativeTime } from "../CardDetail/utils";
import type {
  WorkstreamCard as WorkstreamCardType,
  CardActionCallbacks,
  KanbanStatus,
} from "./types";

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get color class for the card's left border accent.
 * Based on the card's horizon for visual grouping.
 */
function getAccentBorderClass(horizon: "H1" | "H2" | "H3"): string {
  const accentMap: Record<string, string> = {
    H1: "border-l-green-500",
    H2: "border-l-amber-500",
    H3: "border-l-purple-500",
  };
  return accentMap[horizon] || "border-l-gray-400";
}

/**
 * Parse stage number from stage_id if needed.
 * Handles both number and string formats (e.g., "1_concept" -> 1).
 */
function parseStageNumber(stageId: number | string): number | null {
  if (typeof stageId === "number") {
    return stageId;
  }
  const match = String(stageId).match(/^(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

/**
 * AddedFromTooltipContent - Explains why the card was added to the workstream
 */
function AddedFromTooltipContent({
  addedFrom,
  card,
}: {
  addedFrom: "auto" | "manual" | "follow";
  card: WorkstreamCardType["card"];
}) {
  const pillar = getPillarByCode(card.pillar_id);

  if (addedFrom === "auto") {
    return (
      <div className="space-y-2 min-w-[180px] max-w-[240px]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            Auto-matched
          </span>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          This signal was automatically added because it matched your workstream
          filters:
        </p>
        <div className="space-y-1 text-xs">
          {pillar && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-gray-400">Pillar:</span>
              <span className="text-gray-700 dark:text-gray-300">
                {pillar.name}
              </span>
            </div>
          )}
          {card.horizon && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-gray-400">Horizon:</span>
              <span className="text-gray-700 dark:text-gray-300">
                {card.horizon}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (addedFrom === "manual") {
    return (
      <div className="space-y-2 min-w-[140px]">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            Manually added
          </span>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          You added this signal to your workstream.
        </p>
      </div>
    );
  }

  // 'follow'
  return (
    <div className="space-y-2 min-w-[140px]">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-pink-500" />
        <span className="font-medium text-gray-900 dark:text-gray-100">
          From followed signal
        </span>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Added because you followed this signal.
      </p>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

/**
 * KanbanCard - A draggable card for the kanban board.
 *
 * Renders a compact card with key metadata badges and indicators.
 * Supports drag-and-drop reordering via @dnd-kit.
 */
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

  // Configure sortable behavior — disabled in the drag overlay (already
  // floating) and on read-only (org-owned) boards.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    disabled: isDragOverlay || readOnly,
    data: {
      type: "card",
      card,
    },
  });

  // Apply transform styles for drag animation
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Extract card data
  const { card: embeddedCard } = card;
  const stageNumber = parseStageNumber(embeddedCard.stage_id);
  const hasNotes = card.notes && card.notes.trim().length > 0;
  const hasReminder = card.reminder_at !== null;

  // Optimistic state for review approval
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
      // Revert on failure — let the server state win.
      setOptimisticWatching(null);
    }
  };

  // Quick-triage keyboard shortcuts — only active for inbox cards while
  // the pointer is over the card. Keys: e/a accept (→ working), x/r dismiss
  // (→ archived), w toggle watching. Ignored when typing in form fields.
  const [isHovered, setIsHovered] = useState(false);
  useEffect(() => {
    if (!isHovered || columnId !== "inbox" || isDragOverlay || !cardActions) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "e" || k === "a") {
        e.preventDefault();
        cardActions.onMoveToColumn?.(card.id, "working");
      } else if (k === "x" || k === "r") {
        e.preventDefault();
        cardActions.onMoveToColumn?.(card.id, "archived");
      } else if (k === "w") {
        e.preventDefault();
        const next = !isWatching;
        setOptimisticWatching(next);
        Promise.resolve(cardActions.onToggleWatching?.(card.id, next)).catch(
          () => setOptimisticWatching(null),
        );
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isHovered, columnId, isDragOverlay, cardActions, card.id, isWatching]);

  // Brief-status chip — hidden when the card has no brief artifact yet.
  const briefChip = (() => {
    switch (card.brief_status) {
      case "draft":
        return {
          label: "Draft brief",
          className:
            "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
        };
      case "ready":
        return {
          label: "Brief ready",
          className:
            "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
        };
      case "exported":
        return {
          label: "Brief exported",
          className:
            "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
        };
      default:
        return null;
    }
  })();

  // Freshness chip — shown only when research has been run.
  const freshnessChip =
    card.last_research_depth !== "none" && card.last_research_at
      ? {
          icon:
            card.last_research_depth === "deep" ? (
              <FlaskConical className="h-3 w-3" />
            ) : (
              <Zap className="h-3 w-3" />
            ),
          label: `${
            card.last_research_depth === "deep" ? "Deep" : "Quick"
          } · ${formatRelativeTime(card.last_research_at)}`,
        }
      : null;

  /**
   * Handle card click navigation.
   * Prevents navigation during drag operations.
   */
  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if dragging
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

  /**
   * Handle keyboard navigation for accessibility.
   */
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
      {...attributes}
      {...listeners}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        // Base card styles
        "group relative bg-white dark:bg-dark-surface rounded-lg shadow-sm",
        "border border-gray-200 dark:border-gray-700",
        "border-l-4",
        getAccentBorderClass(embeddedCard.horizon),
        // Hover and interaction states
        "transition-all duration-200",
        "hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600",
        // Drag states
        isDragging && "opacity-50 shadow-lg ring-2 ring-brand-blue/50",
        isDragOverlay && "shadow-xl scale-105 rotate-2 cursor-grabbing",
        // Selection ring — wins over hover-shadow so the user can scan
        // the selection at a glance.
        isSelected &&
          "ring-2 ring-brand-blue ring-offset-1 dark:ring-offset-dark-surface-deep",
        // Touch optimization and cursor
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

      {/* Top-right actions: Card Actions Menu */}
      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-0.5 z-10",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          isDragOverlay && "opacity-100",
        )}
      >
        {/* Card Actions Menu */}
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

      {/* Card Content - Clickable Area */}
      <div
        data-kanban-card={card.id}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        className="p-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-inset rounded-lg"
      >
        {/* Card Title */}
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2 pr-6 line-clamp-2">
          {embeddedCard.name}
        </h4>

        {/* Badge Row */}
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

        {/* Needs Review Badge */}
        {showNeedsReview && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
              <AlertCircle className="h-3 w-3" />
              Needs Review
            </span>
          </div>
        )}

        {/* Top 25 Badge - if applicable */}
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

        {/* Research Status Indicator */}
        {card.research_status && card.research_status.status && (
          <div
            className={cn(
              "flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700",
              // Pulse animation for active research
              (card.research_status.status === "queued" ||
                card.research_status.status === "processing") &&
                "animate-pulse",
            )}
          >
            {(card.research_status.status === "queued" ||
              card.research_status.status === "processing") && (
              <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs font-medium">
                  {card.research_status.task_type === "deep_research"
                    ? "Deep Dive"
                    : "Updating"}
                  ...
                </span>
              </div>
            )}
            {card.research_status.status === "completed" && (
              <Tooltip
                content="Research complete - click to view results"
                side="top"
                disabled={isDragOverlay}
              >
                <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 cursor-pointer hover:text-green-700 dark:hover:text-green-300 transition-colors">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Research Ready</span>
                </div>
              </Tooltip>
            )}
            {card.research_status.status === "failed" && (
              <Tooltip
                content="Research failed - try again"
                side="top"
                disabled={isDragOverlay}
              >
                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Failed</span>
                </div>
              </Tooltip>
            )}
          </div>
        )}

        {/* v2 attribute chips: brief status, freshness. Watching lives in
            the indicators row below so it sits next to the toggle target. */}
        {(briefChip || freshnessChip) && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {briefChip && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border",
                  briefChip.className,
                )}
              >
                <FileText className="h-3 w-3" />
                {briefChip.label}
              </span>
            )}
            {freshnessChip && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800"
                title="Last research run"
              >
                {freshnessChip.icon}
                {freshnessChip.label}
              </span>
            )}
          </div>
        )}

        {/* Indicators Row */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          {/* Watching toggle */}
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

          {/* Notes Indicator */}
          {hasNotes && (
            <div
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
              title="Has notes"
            >
              <StickyNote className="h-3 w-3" />
              <span className="sr-only">Has notes</span>
            </div>
          )}

          {/* Reminder Indicator */}
          {hasReminder && (
            <div
              className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
              title="Reminder set"
            >
              <Bell className="h-3 w-3" />
              <span className="sr-only">Reminder set</span>
            </div>
          )}

          {/* Added From Badge - with tooltip explaining why */}
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

        {/* Quick Actions for Inbox Cards */}
        {columnId === "inbox" &&
          cardActions?.onMoveToColumn &&
          !isDragOverlay && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              {/* Approve Review button - only for cards pending review */}
              {showNeedsReview && cardActions.onApproveReview && (
                <Tooltip
                  content="Approve content quality"
                  side="top"
                  disabled={isDragOverlay}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsApproved(true);
                      cardActions.onApproveReview?.(card.id);
                    }}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-md transition-colors"
                    title="Approve Review"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Approve
                  </button>
                </Tooltip>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cardActions.onMoveToColumn?.(card.id, "working");
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-md transition-colors"
                title="Move to Working (E or A)"
              >
                <Check className="h-3.5 w-3.5" />
                Accept
                <kbd className="ml-1 px-1 text-[10px] font-mono bg-white/60 dark:bg-black/20 rounded border border-green-200 dark:border-green-800">
                  E
                </kbd>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cardActions.onMoveToColumn?.(card.id, "archived");
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-md transition-colors"
                title="Move to Archived (X or R)"
              >
                <X className="h-3.5 w-3.5" />
                Dismiss
                <kbd className="ml-1 px-1 text-[10px] font-mono bg-white/60 dark:bg-black/20 rounded border border-red-200 dark:border-red-800">
                  X
                </kbd>
              </button>
            </div>
          )}
      </div>
    </div>
  );
});

export default KanbanCard;
