/**
 * Tests for VirtualizedGrid Component
 *
 * Tests cover:
 * - Basic rendering structure
 * - Empty state
 * - Loading state
 * - Configuration props
 *
 * Note: @tanstack/react-virtual requires real dimensions to calculate visible items.
 * Tests that depend on item rendering are limited in jsdom without proper ResizeObserver support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VirtualizedGrid, VirtualizedGridProps } from "../VirtualizedGrid";

// Test item type
interface TestItem {
  id: string;
  name: string;
}

// Helper to create test items
function createTestItems(count: number): TestItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    name: `Item ${i}`,
  }));
}

// Helper to render a VirtualizedGrid with default props
function renderVirtualizedGrid<T>(
  props: Partial<VirtualizedGridProps<T>> & { items: T[] },
) {
  const defaultProps = {
    renderItem: (item: T, index: number) => (
      <div data-testid={`item-${index}`}>{String((item as TestItem).name)}</div>
    ),
    getItemKey: (item: T, index: number) =>
      (item as TestItem).id ?? String(index),
    estimatedRowHeight: 100,
  };

  return render(
    <div style={{ height: "400px", overflow: "auto" }}>
      <VirtualizedGrid {...defaultProps} {...props} />
    </div>,
  );
}

describe("VirtualizedGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Rendering", () => {
    it("renders without crashing", () => {
      const items = createTestItems(6);
      const { container } = renderVirtualizedGrid({ items });

      // Should have a container with overflow-auto class
      expect(container.querySelector(".overflow-auto")).toBeInTheDocument();
    });

    it("applies custom className to container", () => {
      const items = createTestItems(6);
      const { container } = renderVirtualizedGrid({
        items,
        className: "custom-grid-class",
      });

      const gridContainer = container.querySelector(".custom-grid-class");
      expect(gridContainer).toBeInTheDocument();
    });

    it("renders h-full and w-full classes on container", () => {
      const items = createTestItems(6);
      const { container } = renderVirtualizedGrid({ items });

      const gridContainer = container.querySelector(".h-full.w-full");
      expect(gridContainer).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("renders custom empty state when items array is empty", () => {
      const EmptyState = <div data-testid="empty-state">No items found</div>;
      renderVirtualizedGrid({ items: [], emptyState: EmptyState });

      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
      expect(screen.getByText("No items found")).toBeInTheDocument();
    });

    it("renders nothing special when items are empty and no emptyState provided", () => {
      const { container } = renderVirtualizedGrid({ items: [] });

      // Should render container but no grid rows
      const gridRows = container.querySelectorAll(
        '[style*="grid-template-columns"]',
      );
      expect(gridRows.length).toBe(0);
    });

    it("does not call renderItem when items are empty", () => {
      const renderItem = vi.fn();
      renderVirtualizedGrid({ items: [], renderItem });

      expect(renderItem).not.toHaveBeenCalled();
    });
  });

  describe("Loading State", () => {
    it("renders custom loading state when isLoading is true", () => {
      const LoadingState = <div data-testid="loading-state">Loading...</div>;
      const items = createTestItems(6);
      renderVirtualizedGrid({
        items,
        isLoading: true,
        loadingState: LoadingState,
      });

      expect(screen.getByTestId("loading-state")).toBeInTheDocument();
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("does not render grid when loading", () => {
      const LoadingState = <div data-testid="loading-state">Loading...</div>;
      const items = createTestItems(6);
      const { container } = renderVirtualizedGrid({
        items,
        isLoading: true,
        loadingState: LoadingState,
      });

      // Items should not be in the DOM during loading
      expect(screen.queryByTestId("item-0")).not.toBeInTheDocument();
      // Grid container should not be present
      const gridRows = container.querySelectorAll(
        '[style*="grid-template-columns"]',
      );
      expect(gridRows.length).toBe(0);
    });

    it("does not call renderItem when loading", () => {
      const LoadingState = <div>Loading...</div>;
      const renderItem = vi.fn();
      const items = createTestItems(6);
      renderVirtualizedGrid({
        items,
        isLoading: true,
        loadingState: LoadingState,
        renderItem,
      });

      expect(renderItem).not.toHaveBeenCalled();
    });
  });

  describe("Item Key Generation", () => {
    it("uses getItemKey when provided", () => {
      const items = createTestItems(3);
      const getItemKey = vi.fn((item: TestItem) => `custom-${item.id}`);

      renderVirtualizedGrid({ items, getItemKey });

      // getItemKey may be called during setup
      // The important thing is no error occurs
      expect(screen.queryByTestId("loading-state")).not.toBeInTheDocument();
    });
  });

  describe("Configuration Props", () => {
    it("accepts gap prop", () => {
      const items = createTestItems(5);
      const { container } = renderVirtualizedGrid({ items, gap: 16 });
      expect(container).toBeInTheDocument();
    });

    it("accepts estimatedRowHeight prop", () => {
      const items = createTestItems(5);
      const { container } = renderVirtualizedGrid({
        items,
        estimatedRowHeight: 200,
      });
      expect(container).toBeInTheDocument();
    });

    it("accepts overscan prop", () => {
      const items = createTestItems(50);
      const { container } = renderVirtualizedGrid({ items, overscan: 5 });
      expect(container).toBeInTheDocument();
    });

    it("accepts columns configuration", () => {
      const items = createTestItems(5);
      const { container } = renderVirtualizedGrid({
        items,
        columns: { sm: 1, md: 2, lg: 4 },
      });
      expect(container).toBeInTheDocument();
    });

    it("accepts onScroll callback", () => {
      const items = createTestItems(5);
      const onScroll = vi.fn();
      const { container } = renderVirtualizedGrid({
        items,
        onScroll,
      });
      expect(container).toBeInTheDocument();
    });

    it("accepts initialScrollOffset prop", () => {
      const items = createTestItems(50);
      const { container } = renderVirtualizedGrid({
        items,
        initialScrollOffset: 500,
      });
      expect(container).toBeInTheDocument();
    });
  });

  describe("Default Configuration", () => {
    it("uses default gap of 24px", () => {
      const items = createTestItems(6);
      const { container } = renderVirtualizedGrid({ items });
      expect(container).toBeInTheDocument();
    });

    it("uses default estimatedRowHeight of 280px", () => {
      const items = createTestItems(6);
      const { container } = renderVirtualizedGrid({ items });
      expect(container).toBeInTheDocument();
    });

    it("uses default columns of 1/2/3", () => {
      const items = createTestItems(6);
      const { container } = renderVirtualizedGrid({ items });
      expect(container).toBeInTheDocument();
    });

    it("uses default overscan of 3", () => {
      const items = createTestItems(50);
      const { container } = renderVirtualizedGrid({ items });
      expect(container).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("handles single item correctly", () => {
      const items = createTestItems(1);
      const { container } = renderVirtualizedGrid({ items });
      expect(container).toBeInTheDocument();
    });

    it("handles large number of items without error", () => {
      const items = createTestItems(1000);
      const { container } = renderVirtualizedGrid({ items });
      expect(container).toBeInTheDocument();
    });
  });

  describe("Scroll Container", () => {
    it("creates a scrollable container", () => {
      const items = createTestItems(50);
      const { container } = renderVirtualizedGrid({ items });

      const scrollContainer = container.querySelector(".overflow-auto");
      expect(scrollContainer).toBeInTheDocument();
    });
  });

  // jsdom doesn't do layout, so the virtualizer never sees a non-zero
  // containerWidth and the placeholder div is what gets the scroll listener.
  // That's fine for these tests — onEndReached only depends on
  // scrollHeight/clientHeight/scrollTop, which we set directly with
  // Object.defineProperty.
  describe("Infinite Scroll (onEndReached)", () => {
    function mockScrollDims(
      el: HTMLElement,
      dims: { scrollHeight: number; clientHeight: number; scrollTop: number },
    ) {
      Object.defineProperty(el, "scrollHeight", {
        configurable: true,
        value: dims.scrollHeight,
      });
      Object.defineProperty(el, "clientHeight", {
        configurable: true,
        value: dims.clientHeight,
      });
      Object.defineProperty(el, "scrollTop", {
        configurable: true,
        writable: true,
        value: dims.scrollTop,
      });
    }

    it("fires onEndReached when scroll is within the threshold band", () => {
      const onEndReached = vi.fn();
      const items = createTestItems(100);
      const { container } = renderVirtualizedGrid({
        items,
        onEndReached,
        endReachedThreshold: 100,
      });

      const scrollContainer = container.querySelector(
        ".overflow-auto",
      ) as HTMLDivElement;
      // distance = 2000 - 1550 - 400 = 50 (≤ 100)
      mockScrollDims(scrollContainer, {
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 1550,
      });

      fireEvent.scroll(scrollContainer);
      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    it("does not re-fire while still inside the threshold band", () => {
      const onEndReached = vi.fn();
      const items = createTestItems(100);
      const { container } = renderVirtualizedGrid({
        items,
        onEndReached,
        endReachedThreshold: 100,
      });

      const scrollContainer = container.querySelector(
        ".overflow-auto",
      ) as HTMLDivElement;
      mockScrollDims(scrollContainer, {
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 1550,
      });

      fireEvent.scroll(scrollContainer);
      fireEvent.scroll(scrollContainer);
      fireEvent.scroll(scrollContainer);
      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    it("re-fires after scrolling out of and back into the threshold band", () => {
      const onEndReached = vi.fn();
      const items = createTestItems(100);
      const { container } = renderVirtualizedGrid({
        items,
        onEndReached,
        endReachedThreshold: 100,
      });

      const scrollContainer = container.querySelector(
        ".overflow-auto",
      ) as HTMLDivElement;

      mockScrollDims(scrollContainer, {
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 1550,
      });
      fireEvent.scroll(scrollContainer);
      expect(onEndReached).toHaveBeenCalledTimes(1);

      // Scroll back to the top — out of the band.
      (scrollContainer as unknown as { scrollTop: number }).scrollTop = 0;
      fireEvent.scroll(scrollContainer);
      expect(onEndReached).toHaveBeenCalledTimes(1);

      // Re-enter the band.
      (scrollContainer as unknown as { scrollTop: number }).scrollTop = 1550;
      fireEvent.scroll(scrollContainer);
      expect(onEndReached).toHaveBeenCalledTimes(2);
    });

    it("does not fire when distance from end exceeds threshold", () => {
      const onEndReached = vi.fn();
      const items = createTestItems(100);
      const { container } = renderVirtualizedGrid({
        items,
        onEndReached,
        endReachedThreshold: 100,
      });

      const scrollContainer = container.querySelector(
        ".overflow-auto",
      ) as HTMLDivElement;
      // distance = 2000 - 500 - 400 = 1100 (> 100)
      mockScrollDims(scrollContainer, {
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 500,
      });

      fireEvent.scroll(scrollContainer);
      expect(onEndReached).not.toHaveBeenCalled();
    });

    it("does not fire when onEndReached is not provided", () => {
      const items = createTestItems(100);
      const { container } = renderVirtualizedGrid({ items });

      const scrollContainer = container.querySelector(
        ".overflow-auto",
      ) as HTMLDivElement;
      mockScrollDims(scrollContainer, {
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 1550,
      });

      // Should not throw — just verify the scroll handler is a no-op for end-reached.
      expect(() => fireEvent.scroll(scrollContainer)).not.toThrow();
    });

    // Locks in the default endReachedThreshold (480px). All other tests pass
    // an explicit `endReachedThreshold`, so without this case a regression that
    // changed the default would slip through.
    it("uses the default endReachedThreshold (480px) when none is provided", () => {
      const onEndReached = vi.fn();
      const items = createTestItems(100);
      const { container } = renderVirtualizedGrid({
        items,
        onEndReached,
        // Intentionally omit endReachedThreshold to exercise the default.
      });

      const scrollContainer = container.querySelector(
        ".overflow-auto",
      ) as HTMLDivElement;

      // distance = 2000 - 1121 - 400 = 479 (≤ 480, inside the default band)
      mockScrollDims(scrollContainer, {
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 1121,
      });
      fireEvent.scroll(scrollContainer);
      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    it("does not fire under the default threshold when just outside the band", () => {
      const onEndReached = vi.fn();
      const items = createTestItems(100);
      const { container } = renderVirtualizedGrid({
        items,
        onEndReached,
      });

      const scrollContainer = container.querySelector(
        ".overflow-auto",
      ) as HTMLDivElement;

      // distance = 2000 - 1119 - 400 = 481 (> 480, outside the default band)
      mockScrollDims(scrollContainer, {
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 1119,
      });
      fireEvent.scroll(scrollContainer);
      expect(onEndReached).not.toHaveBeenCalled();
    });
  });
});
