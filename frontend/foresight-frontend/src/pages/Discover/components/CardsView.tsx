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
}

export function CardsView({
  viewMode,
  cards,
  renderItem,
  listRef,
  gridRef,
}: CardsViewProps) {
  if (viewMode === "list") {
    return (
      <VirtualizedList
        ref={listRef}
        items={cards}
        renderItem={renderItem}
        getItemKey={(card) => card.id}
        estimatedSize={180}
        gap={16}
        overscan={3}
        scrollContainerClassName="h-[calc(100vh-280px)]"
        ariaLabel="Intelligence signals list"
      />
    );
  }

  return (
    <div className="h-[calc(100vh-400px)] min-h-[500px]">
      <VirtualizedGrid
        ref={gridRef}
        items={cards}
        getItemKey={(card) => card.id}
        estimatedRowHeight={280}
        gap={24}
        columns={{ sm: 1, md: 2, lg: 3 }}
        overscan={3}
        renderItem={(card, index) => (
          <div className="h-full">{renderItem(card, index)}</div>
        )}
      />
    </div>
  );
}
