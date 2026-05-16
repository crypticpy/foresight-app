/**
 * Paginated personal-signals feed hook.
 *
 * Owns:
 *   - Stats query (one fetch, runs in parallel with the first page).
 *   - Paginated feed (offset cursor, infinite scroll).
 *   - Pinned signals (full list, only fetched on the first page; persisted
 *     across `loadMore()` so the top section doesn't flicker).
 *   - Optimistic patch helpers for pin/follow toggles.
 *
 * The first page + stats are kicked off in parallel on mount / on filter
 * change. Subsequent pages are triggered by the page-level
 * `IntersectionObserver` sentinel calling `loadMore()`.
 *
 * @module pages/Signals/useSignalsFeed
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSignalsPage, fetchSignalsStats } from "./api";
import type {
  MySignalsPage,
  PersonalSignal,
  SignalStats,
  WorkstreamRef,
} from "./types";

const INITIAL_STATS: SignalStats = {
  total: 0,
  followed_count: 0,
  created_count: 0,
  workstream_count: 0,
  updates_this_week: 0,
  needs_research: 0,
};

const PAGE_SIZE = 30;

export interface UseSignalsFeedResult {
  /** All loaded feed pages flattened in order (pinned NOT included). */
  signals: PersonalSignal[];
  /** Pinned signals — rendered as a stable top section. */
  pinned: PersonalSignal[];
  stats: SignalStats;
  workstreams: WorkstreamRef[];
  /** True until the first page lands. Subsequent pages use `isFetchingMore`. */
  loading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** Trigger by the IntersectionObserver sentinel — safe to call repeatedly. */
  loadMore: () => void;
  /** Forced full refetch (e.g. after creating a new signal). */
  refresh: () => void;
  /** Clear the current load/loadMore error without retrying. */
  clearError: () => void;
  /** Optimistic in-place patch for pin/follow toggles. */
  patchSignal: (cardId: string, patch: Partial<PersonalSignal>) => void;
  /** Optimistic stat counter delta — keeps StatsRow numbers honest after pin. */
  patchStats: (delta: Partial<SignalStats>) => void;
}

export function useSignalsFeed(
  params: Record<string, string>,
): UseSignalsFeedResult {
  const [signals, setSignals] = useState<PersonalSignal[]>([]);
  const [pinned, setPinned] = useState<PersonalSignal[]>([]);
  const [stats, setStats] = useState<SignalStats>(INITIAL_STATS);
  const [workstreams, setWorkstreams] = useState<WorkstreamRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);

  // We capture the params used to issue the in-flight initial fetch so a
  // late-returning response from a stale filter doesn't clobber a newer one.
  const inflightTokenRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const token = ++inflightTokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const [statsResp, page] = await Promise.all([
        fetchSignalsStats(params),
        fetchSignalsPage({
          params,
          offset: 0,
          limit: PAGE_SIZE,
          includePinned: true,
        }),
      ]);
      if (token !== inflightTokenRef.current) return; // superseded
      setStats(statsResp.stats);
      setWorkstreams(statsResp.workstreams);
      setSignals(page.signals);
      setPinned(page.pinned ?? []);
      setHasMore(page.has_more);
      offsetRef.current = page.next_offset;
    } catch (err) {
      if (token !== inflightTokenRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load signals. Please try again.",
      );
    } finally {
      if (token === inflightTokenRef.current) setLoading(false);
    }
  }, [params]);

  const loadMore = useCallback(async () => {
    if (loading || isFetchingMore || !hasMore) return;
    // Snapshot the same token loadFirstPage uses so a late loadMore from a
    // previous filter set can't append into the freshly reset feed.
    const token = inflightTokenRef.current;
    setIsFetchingMore(true);
    try {
      const page: MySignalsPage = await fetchSignalsPage({
        params,
        offset: offsetRef.current,
        limit: PAGE_SIZE,
        includePinned: false,
      });
      if (token !== inflightTokenRef.current) return; // superseded
      // Dedupe by id — defensive against rare timing where a new card was
      // created between pages.
      setSignals((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        const incoming = page.signals.filter((s) => !seen.has(s.id));
        return [...prev, ...incoming];
      });
      setHasMore(page.has_more);
      offsetRef.current = page.next_offset;
    } catch (err) {
      if (token !== inflightTokenRef.current) return;
      setError(
        err instanceof Error ? err.message : "Failed to load more signals.",
      );
    } finally {
      if (token === inflightTokenRef.current) setIsFetchingMore(false);
    }
  }, [loading, isFetchingMore, hasMore, params]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const patchSignal = useCallback(
    (cardId: string, patch: Partial<PersonalSignal>) => {
      const apply = (list: PersonalSignal[]) =>
        list.map((s) => (s.id === cardId ? { ...s, ...patch } : s));

      // Patch the feed list, then mirror the change into `pinned` so an
      // optimistic pin inserts the card and an optimistic unpin removes it.
      // Without this the pinned section can show stale entries after unpin
      // or fail to show a freshly pinned card from the feed.
      setSignals((prevSignals) => {
        const nextSignals = apply(prevSignals);

        setPinned((prevPinned) => {
          const patchedPinned = apply(prevPinned);
          if (patch.is_pinned === false) {
            return patchedPinned.filter((s) => s.id !== cardId);
          }
          if (
            patch.is_pinned === true &&
            !patchedPinned.some((s) => s.id === cardId)
          ) {
            const fromFeed = nextSignals.find((s) => s.id === cardId);
            if (fromFeed) return [fromFeed, ...patchedPinned];
          }
          return patchedPinned;
        });

        return nextSignals;
      });
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  const patchStats = useCallback((delta: Partial<SignalStats>) => {
    setStats((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(delta) as Array<keyof SignalStats>) {
        const d = delta[key];
        if (d === undefined) continue;
        next[key] = Math.max(0, (prev[key] ?? 0) + d);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  return {
    signals,
    pinned,
    stats,
    workstreams,
    loading,
    isFetchingMore,
    hasMore,
    error,
    loadMore,
    refresh: loadFirstPage,
    clearError,
    patchSignal,
    patchStats,
  };
}
