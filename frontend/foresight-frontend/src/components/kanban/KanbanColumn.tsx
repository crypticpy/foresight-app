/**
 * KanbanColumn (v2)
 *
 * Droppable column for the four-stage kanban board. Stage-specific buttons
 * (Quick Update / Deep Dive / Generate Brief / Check Updates / Export All)
 * have moved out — they live in the per-card menu and the selection-driven
 * toolbar now. The column header is purely informational + drop target.
 */

import { memo, useCallback, useMemo, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Inbox,
  FlaskConical,
  FileText,
  Archive,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { KanbanCard } from "./KanbanCard";
import {
  KANBAN_COLUMNS,
  type KanbanStatus,
  type WorkstreamCard,
  type OnCardClickCallback,
  type CardActionCallbacks,
} from "./types";

// =============================================================================
// Types
// =============================================================================

export interface KanbanColumnProps {
  id: KanbanStatus;
  title: string;
  description: string;
  cards: WorkstreamCard[];
  workstreamId?: string;
  /** When true, cards in this column do not support drag (read-only board). */
  readOnly?: boolean;
  onCardClick?: OnCardClickCallback;
  cardActions?: CardActionCallbacks;
  /** Set of currently-selected workstream-card ids (for bulk actions). */
  selectedCardIds?: Set<string>;
  /** Toggle a card's membership in the bulk-action selection. */
  onToggleSelect?: (cardId: string) => void;
  /** Optional additional class names for responsive board layouts. */
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

const COLUMN_ICONS: Record<KanbanStatus, LucideIcon> = {
  inbox: Inbox,
  working: FlaskConical,
  ready: FileText,
  archived: Archive,
};

const COLUMN_COLORS: Record<
  KanbanStatus,
  { bg: string; text: string; border: string }
> = {
  inbox: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
  },
  working: {
    bg: "bg-purple-50 dark:bg-purple-900/20",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-200 dark:border-purple-800",
  },
  ready: {
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
  },
  archived: {
    bg: "bg-gray-50 dark:bg-dark-surface/50",
    text: "text-gray-500 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
  },
};

// =============================================================================
// Sub-components
// =============================================================================

interface EmptyColumnStateProps {
  columnId: KanbanStatus;
  hint?: string;
}

function EmptyColumnState({ columnId, hint }: EmptyColumnStateProps) {
  const colors = COLUMN_COLORS[columnId];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-8 px-4",
        "border-2 border-dashed rounded-lg",
        "text-center",
        colors.border,
      )}
    >
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No signals in this column
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        {hint || "Drag cards here to move them"}
      </p>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export const KanbanColumn = memo(function KanbanColumn({
  id,
  title,
  description,
  cards,
  workstreamId,
  readOnly = false,
  onCardClick,
  cardActions,
  selectedCardIds,
  onToggleSelect,
  className,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      type: "column",
      columnId: id,
    },
  });

  const columnDef = useMemo(
    () => KANBAN_COLUMNS.find((col) => col.id === id),
    [id],
  );

  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);

  const colors = COLUMN_COLORS[id];
  const Icon = COLUMN_ICONS[id];

  // Virtualize the card list so columns with hundreds of cards (post-pruning
  // pool can hit ~700 per template / clone) stay smooth. dnd-kit's
  // SortableContext only needs the id array — not all card DOM nodes — to
  // track sort order, so off-screen cards still participate in drag math
  // when the user scrolls to them.
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => scrollParentRef.current, []);
  const estimateSize = useCallback(() => 180, []);
  const getVirtualKey = useCallback(
    (index: number) => cards[index]?.id ?? index,
    [cards],
  );

  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement,
    estimateSize,
    overscan: 5,
    gap: 12,
    getItemKey: getVirtualKey,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={setNodeRef}
      data-kanban-column={id}
      className={cn(
        "flex flex-col",
        "w-full md:w-72 md:min-w-72 xl:w-full xl:min-w-0 flex-shrink-0",
        "bg-gray-50 dark:bg-dark-surface-deep",
        "rounded-xl",
        "border border-gray-200 dark:border-gray-800",
        "transition-all duration-200",
        isOver && "ring-2 ring-brand-blue/50 border-brand-blue/50",
        className,
      )}
    >
      {/* Column Header */}
      <div
        className={cn(
          "px-4 py-3 rounded-t-xl",
          "border-b",
          colors.bg,
          colors.border,
        )}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", colors.text)} />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              {title}
            </h3>
          </div>
          <span
            className={cn(
              "inline-flex items-center justify-center",
              "min-w-5 h-5 px-1.5",
              "text-xs font-medium rounded-full",
              cards.length > 0
                ? cn(colors.bg, colors.text, "border", colors.border)
                : "bg-gray-100 text-gray-500 dark:bg-dark-surface dark:text-gray-400",
            )}
          >
            {cards.length}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
          {description}
        </p>
      </div>

      {/* Card List */}
      <div
        ref={scrollParentRef}
        className={cn(
          "flex-1 p-3 overflow-y-auto",
          "min-h-32 max-h-[calc(100vh-280px)]",
          "transition-all duration-200",
        )}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.length > 0 ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualItems.map((virtualItem) => {
                const card = cards[virtualItem.index];
                if (!card) return null;
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <KanbanCard
                      card={card}
                      workstreamId={workstreamId}
                      columnId={id}
                      readOnly={readOnly}
                      onCardClick={onCardClick}
                      cardActions={cardActions}
                      isSelected={selectedCardIds?.has(card.id) ?? false}
                      onToggleSelect={onToggleSelect}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyColumnState columnId={id} hint={columnDef?.emptyStateHint} />
          )}
        </SortableContext>
      </div>
    </div>
  );
});

export default KanbanColumn;
