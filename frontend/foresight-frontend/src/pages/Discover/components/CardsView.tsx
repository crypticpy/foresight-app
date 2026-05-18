/**
 * Switches between the virtualized list and virtualized grid layouts based
 * on the current view mode. Forwards a ref to whichever virtualizer is
 * mounted so the parent can call `getScrollOffset`/`setScrollOffset` on it
 * (used by scroll restoration + sort reset).
 *
 * @module pages/Discover/components/CardsView
 */

import {
  VirtualizedGrid,
  type VirtualizedGridHandle,
} from "../../../components/VirtualizedGrid";
import {
  VirtualizedList,
  type VirtualizedListHandle,
} from "../../../components/VirtualizedList";
import type { Card } from "../types";

export interface CardsViewProps {
  viewMode: "grid" | "list";
  cards: Card[];
  renderItem: (card: Card, index?: number) => React.ReactNode;
  listRef: React.RefObject<VirtualizedListHandle>;
  gridRef: React.RefObject<VirtualizedGridHandle>;
  /** Called when the user scrolls near the bottom — drives infinite scroll. */
  onEndReached?: () => void;
  /** When true, a footer spinner is rendered below the virtualizer. */
  isFetchingMore?: boolean;
}

export function CardsView({
  viewMode,
  cards,
  renderItem,
  listRef,
  gridRef,
  onEndReached,
  isFetchingMore = false,
}: CardsViewProps) {
  const footer = isFetchingMore ? (
    <div className="flex items-center justify-center py-4">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-blue" />
    </div>
  ) : null;

  // `DiscoverCard`'s `ArtifactFolderTab` is absolutely positioned at `-top-4`
  // (16px above the card), so the first row's tab gets clipped by the
  // virtualizer's `overflow-auto` scroll container. Adding `pt-5` (20px) to
  // the scroll container reserves vertical room for the tab without affecting
  // virtualizer scroll math.
  if (viewMode === "list") {
    return (
      <>
        <VirtualizedList
          ref={listRef}
          items={cards}
          renderItem={renderItem}
          getItemKey={(card) => card.id}
          estimatedSize={180}
          gap={16}
          overscan={3}
          scrollContainerClassName="h-[calc(100vh-280px)] pt-5"
          ariaLabel="Intelligence signals list"
          onEndReached={onEndReached}
        />
        {footer}
      </>
    );
  }

  return (
    <>
      <div className="h-[calc(100vh-400px)] min-h-[500px]">
        <VirtualizedGrid
          ref={gridRef}
          items={cards}
          getItemKey={(card) => card.id}
          estimatedRowHeight={280}
          gap={24}
          columns={{ sm: 1, md: 2, lg: 3 }}
          overscan={3}
          className="pt-5"
          renderItem={(card, index) => (
            <div className="h-full">{renderItem(card, index)}</div>
          )}
          onEndReached={onEndReached}
        />
      </div>
      {footer}
    </>
  );
}
