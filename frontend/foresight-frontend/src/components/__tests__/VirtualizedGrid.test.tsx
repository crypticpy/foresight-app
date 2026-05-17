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

  // In jsdom the container reports offsetWidth=0, so VirtualizedGrid bails
  // out to a placeholder div (containerWidth === 0). Stub offsetWidth so
  // the real render path runs. Scope to the scroll container (which carries
  // `overflow-auto`) to avoid affecting wrappers or item nodes.
  function mockContainerWidth(width: number) {
    const isScrollContainer = (el: unknown): boolean =>
      el instanceof HTMLElement && el.classList.contains("overflow-auto");
    const widthSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        return isScrollContainer(this) ? width : 0;
      });
    return () => widthSpy.mockRestore();
  }

  // For tests that need `getVirtualItems()` to actually return rows
  // (so we can inspect row-level styles), also stub offsetHeight on the
  // scroll container — @tanstack/virtual-core reads viewport size via
  // `element.offsetHeight` (see virtual-core: `const { offsetWidth,
  // offsetHeight } = element`), not `clientHeight` or
  // `getBoundingClientRect()`. Scope to overflow-auto so it doesn't bleed
  // into per-row measurements (which would corrupt `getTotalSize()`).
  function mockContainerLayout(width: number, viewportHeight = 600) {
    const isScrollContainer = (el: unknown): boolean =>
      el instanceof HTMLElement && el.classList.contains("overflow-auto");
    const restoreWidth = mockContainerWidth(width);
    const heightSpy = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return isScrollContainer(this) ? viewportHeight : 0;
      });
    return () => {
      heightSpy.mockRestore();
      restoreWidth();
    };
  }

  describe("Configuration Props", () => {
    it("applies the gap prop to both grid-gap and inter-row paddingBottom", () => {
      const restoreLayout = mockContainerLayout(1024);
      try {
        const items = createTestItems(6);
        const { container } = renderVirtualizedGrid({
          items,
          gap: 12,
          columns: { sm: 1, md: 1, lg: 1 },
        });
        const rows = container.querySelectorAll<HTMLElement>("[data-index]");
        expect(rows.length).toBeGreaterThan(0);
        const firstRow = rows[0]!;
        expect(firstRow.style.gap).toBe("12px");
        // 6 items / 1 column => 6 rows; the first row is not last, so it gets
        // paddingBottom == gap. (The last row alone uses paddingBottom: 0.)
        expect(firstRow.style.paddingBottom).toBe("12px");
      } finally {
        restoreLayout();
      }
    });

    it("renders gridTemplateColumns from the columns prop at the lg breakpoint", () => {
      const restoreLayout = mockContainerLayout(1024); // >= lg
      try {
        const items = createTestItems(6);
        const { container } = renderVirtualizedGrid({
          items,
          columns: { sm: 1, md: 2, lg: 4 },
        });
        const row = container.querySelector<HTMLElement>("[data-index]");
        expect(row?.style.gridTemplateColumns).toBe(
          "repeat(4, minmax(0, 1fr))",
        );
      } finally {
        restoreLayout();
      }
    });

    it("falls back to the md column count when narrower than the lg breakpoint", () => {
      const restoreLayout = mockContainerLayout(800); // >= md, < lg
      try {
        const items = createTestItems(6);
        const { container } = renderVirtualizedGrid({
          items,
          columns: { sm: 1, md: 3, lg: 5 },
        });
        const row = container.querySelector<HTMLElement>("[data-index]");
        expect(row?.style.gridTemplateColumns).toBe(
          "repeat(3, minmax(0, 1fr))",
        );
      } finally {
        restoreLayout();
      }
    });

    it("uses estimatedRowHeight + gap to size the virtual scroll area", () => {
      // Width-only spy: we only need `getTotalSize()` here, not rendered
      // rows. Leaving offsetHeight=0 keeps `measureElement` from caching
      // measured row sizes, so totalSize = count * estimatedSize.
      const restoreLayout = mockContainerWidth(1024);
      try {
        const items = createTestItems(10);
        const { container } = renderVirtualizedGrid({
          items,
          estimatedRowHeight: 200,
          gap: 50,
          columns: { sm: 1, md: 1, lg: 1 },
        });
        // rowCount = ceil(10 / 1) = 10; totalSize = 10 * (200 + 50) = 2500.
        const sizer = container.querySelector<HTMLElement>(
          '[style*="position: relative"]',
        );
        expect(sizer?.style.height).toBe("2500px");
      } finally {
        restoreLayout();
      }
    });

    it("invokes onScroll with the current scrollTop on scroll events", () => {
      const onScroll = vi.fn();
      const items = createTestItems(50);
      const { container } = renderVirtualizedGrid({ items, onScroll });
      const scrollContainer = container.querySelector(
        ".overflow-auto",
      ) as HTMLDivElement;
      Object.defineProperty(scrollContainer, "scrollTop", {
        configurable: true,
        writable: true,
        value: 250,
      });
      fireEvent.scroll(scrollContainer);
      expect(onScroll).toHaveBeenCalledWith(250);
    });

    it("passes overscan through so more rows than visible are rendered", () => {
      // Visible-rows ≈ clientHeight / (estimatedRowHeight + gap) = 200 / 100 = 2.
      // With overscan=0 the virtualizer keeps just the visible window; with
      // overscan=10 it keeps roughly 2 + 10 rows in the DOM.
      const restoreLayout = mockContainerLayout(1024, 200);
      try {
        const baseProps = {
          items: createTestItems(50),
          estimatedRowHeight: 100,
          gap: 0,
          columns: { sm: 1, md: 1, lg: 1 },
        };
        const { container, unmount } = renderVirtualizedGrid({
          ...baseProps,
          overscan: 0,
        });
        const fewRows = container.querySelectorAll("[data-index]").length;
        unmount();

        const { container: container2 } = renderVirtualizedGrid({
          ...baseProps,
          overscan: 10,
        });
        const manyRows = container2.querySelectorAll("[data-index]").length;
        expect(manyRows).toBeGreaterThan(fewRows);
      } finally {
        restoreLayout();
      }
    });
  });

  describe("Default Configuration", () => {
    it("falls back to gap=24 when the prop is omitted", () => {
      const restoreLayout = mockContainerLayout(1024);
      try {
        // Render directly without the test helper so estimatedRowHeight and
        // gap both fall back to component defaults (we still pin columns so
        // the row count is deterministic).
        const items = createTestItems(6);
        const { container } = render(
          <div style={{ height: "400px", overflow: "auto" }}>
            <VirtualizedGrid
              items={items}
              renderItem={(item, index) => (
                <div data-testid={`item-${index}`}>
                  {String((item as TestItem).name)}
                </div>
              )}
              getItemKey={(item) => (item as TestItem).id}
              columns={{ sm: 1, md: 1, lg: 1 }}
            />
          </div>,
        );
        const row = container.querySelector<HTMLElement>("[data-index]");
        expect(row?.style.gap).toBe("24px");
      } finally {
        restoreLayout();
      }
    });

    it("falls back to estimatedRowHeight=280 + gap=24 in the sizer height", () => {
      // Width-only spy: only `getTotalSize()` is checked here. Leaving
      // offsetHeight=0 keeps `measureElement` from overwriting the
      // estimated per-row size with a measured 0.
      const restoreLayout = mockContainerWidth(1024);
      try {
        const items = createTestItems(5);
        const { container } = render(
          <div style={{ height: "400px", overflow: "auto" }}>
            <VirtualizedGrid
              items={items}
              renderItem={(item, index) => (
                <div data-testid={`item-${index}`}>
                  {String((item as TestItem).name)}
                </div>
              )}
              getItemKey={(item) => (item as TestItem).id}
              columns={{ sm: 1, md: 1, lg: 1 }}
            />
          </div>,
        );
        // rowCount = ceil(5 / 1) = 5; totalSize = 5 * (280 + 24) = 1520.
        const sizer = container.querySelector<HTMLElement>(
          '[style*="position: relative"]',
        );
        expect(sizer?.style.height).toBe("1520px");
      } finally {
        restoreLayout();
      }
    });

    it("falls back to columns lg=3 at >= 1024px when columns omitted", () => {
      const restoreLayout = mockContainerLayout(1024);
      try {
        const items = createTestItems(6);
        const { container } = render(
          <div style={{ height: "400px", overflow: "auto" }}>
            <VirtualizedGrid
              items={items}
              renderItem={(item, index) => (
                <div data-testid={`item-${index}`}>
                  {String((item as TestItem).name)}
                </div>
              )}
              getItemKey={(item) => (item as TestItem).id}
            />
          </div>,
        );
        const row = container.querySelector<HTMLElement>("[data-index]");
        expect(row?.style.gridTemplateColumns).toBe(
          "repeat(3, minmax(0, 1fr))",
        );
      } finally {
        restoreLayout();
      }
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

    // Locks the mount-time underflow contract: when the initial page renders
    // short enough that its content fits inside the viewport (within the
    // end-reached band), `onEndReached` must fire WITHOUT requiring a scroll
    // event, otherwise pagination deadlocks — the user can't scroll because
    // there's nothing to scroll, so the next page never loads.
    //
    // We pre-mock HTMLElement.prototype.scrollHeight etc. so the scroll
    // container already reports in-band dimensions at the moment the effect
    // attaches (the production guard `scrollHeight > 0` requires layout to
    // have measured the element before the initial check runs).
    it("fires onEndReached at mount when content is already within threshold", () => {
      const scrollHeightSpy = vi
        .spyOn(HTMLElement.prototype, "scrollHeight", "get")
        .mockReturnValue(2000);
      const clientHeightSpy = vi
        .spyOn(HTMLElement.prototype, "clientHeight", "get")
        .mockReturnValue(400);
      const scrollTopSpy = vi
        .spyOn(HTMLElement.prototype, "scrollTop", "get")
        .mockReturnValue(1550);

      try {
        const onEndReached = vi.fn();
        const items = createTestItems(100);
        renderVirtualizedGrid({
          items,
          onEndReached,
          endReachedThreshold: 100,
        });

        // No fireEvent.scroll — distance = 2000 - 1550 - 400 = 50 (≤ 100),
        // so the initial in-effect check fires onEndReached exactly once.
        expect(onEndReached).toHaveBeenCalledTimes(1);
      } finally {
        scrollHeightSpy.mockRestore();
        clientHeightSpy.mockRestore();
        scrollTopSpy.mockRestore();
      }
    });

    // Locks in the underfilled-viewport pagination contract: if the first
    // appended page still doesn't push the content out of the end-reached
    // band, the items-changed effect must reset the fired flag and re-fire
    // `onEndReached`. Without that re-check, pagination would stall after the
    // first auto-load because the scroll listener only fires on user scroll.
    it("re-fires onEndReached when items grow but content is still within threshold", () => {
      const scrollHeightSpy = vi
        .spyOn(HTMLElement.prototype, "scrollHeight", "get")
        .mockReturnValue(2000);
      const clientHeightSpy = vi
        .spyOn(HTMLElement.prototype, "clientHeight", "get")
        .mockReturnValue(400);
      const scrollTopSpy = vi
        .spyOn(HTMLElement.prototype, "scrollTop", "get")
        .mockReturnValue(1550);

      try {
        const onEndReached = vi.fn();
        const initialItems = createTestItems(30);
        const { rerender } = renderVirtualizedGrid({
          items: initialItems,
          onEndReached,
          endReachedThreshold: 100,
        });

        // Initial in-band fire from the mount-time check.
        expect(onEndReached).toHaveBeenCalledTimes(1);

        // Simulate a page appended by the parent (items.length changes,
        // dims unchanged — content still inside the threshold band).
        const grownItems = createTestItems(60);
        rerender(
          <div style={{ height: "400px", overflow: "auto" }}>
            <VirtualizedGrid
              items={grownItems}
              renderItem={(item, index) => (
                <div data-testid={`item-${index}`}>
                  {String((item as TestItem).name)}
                </div>
              )}
              getItemKey={(item) => (item as TestItem).id}
              estimatedRowHeight={100}
              onEndReached={onEndReached}
              endReachedThreshold={100}
            />
          </div>,
        );

        // items.length effect resets the fired flag and re-fires once.
        expect(onEndReached).toHaveBeenCalledTimes(2);
      } finally {
        scrollHeightSpy.mockRestore();
        clientHeightSpy.mockRestore();
        scrollTopSpy.mockRestore();
      }
    });
  });
});
