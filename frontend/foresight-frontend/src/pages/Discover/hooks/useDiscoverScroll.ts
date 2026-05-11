/**
 * Owns the virtualized list/grid refs, registers scroll restoration for both
 * view modes, and resets scroll to 0 when the sort option changes (so users
 * don't end up scrolled past the new top row).
 *
 * Returns the refs for the composer to forward into `<VirtualizedList>` /
 * `<VirtualizedGrid>`.
 *
 * @module pages/Discover/hooks/useDiscoverScroll
 */

import { useCallback, useEffect, useRef } from "react";
import type { VirtualizedGridHandle } from "../../../components/VirtualizedGrid";
import type { VirtualizedListHandle } from "../../../components/VirtualizedList";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import type { SortOption } from "../types";

export interface UseDiscoverScrollArgs {
  viewMode: "grid" | "list";
  sortOption: SortOption;
}

export interface UseDiscoverScrollReturn {
  virtualizedListRef: React.RefObject<VirtualizedListHandle>;
  virtualizedGridRef: React.RefObject<VirtualizedGridHandle>;
}

export function useDiscoverScroll({
  viewMode,
  sortOption,
}: UseDiscoverScrollArgs): UseDiscoverScrollReturn {
  const virtualizedListRef = useRef<VirtualizedListHandle>(null);
  const virtualizedGridRef = useRef<VirtualizedGridHandle>(null);

  // Reset scroll to top when sort changes — but skip the initial mount,
  // otherwise we'd fight scroll restoration on first render.
  const hasMountedForSortReset = useRef(false);
  useEffect(() => {
    if (!hasMountedForSortReset.current) {
      hasMountedForSortReset.current = true;
      return;
    }
    if (viewMode === "list") {
      virtualizedListRef.current?.setScrollOffset(0);
    } else {
      virtualizedGridRef.current?.setScrollOffset(0);
    }
  }, [sortOption, viewMode]);

  // Stable getter/setter pairs — defining them inline in useScrollRestoration
  // would create new references every render and re-trigger its effects.
  const getListScrollPosition = useCallback(
    () => virtualizedListRef.current?.getScrollOffset() ?? 0,
    [],
  );
  const setListScrollPosition = useCallback(
    (position: number) => virtualizedListRef.current?.setScrollOffset(position),
    [],
  );
  const getGridScrollPosition = useCallback(
    () => virtualizedGridRef.current?.getScrollOffset() ?? 0,
    [],
  );
  const setGridScrollPosition = useCallback(
    (position: number) => virtualizedGridRef.current?.setScrollOffset(position),
    [],
  );

  useScrollRestoration({
    storageKey: "discover-list",
    enabled: viewMode === "list",
    clearAfterRestore: true,
    saveOnBeforeUnload: false,
    getScrollPosition: getListScrollPosition,
    setScrollPosition: setListScrollPosition,
  });

  useScrollRestoration({
    storageKey: "discover-grid",
    enabled: viewMode === "grid",
    clearAfterRestore: true,
    saveOnBeforeUnload: false,
    getScrollPosition: getGridScrollPosition,
    setScrollPosition: setGridScrollPosition,
  });

  return { virtualizedListRef, virtualizedGridRef };
}
