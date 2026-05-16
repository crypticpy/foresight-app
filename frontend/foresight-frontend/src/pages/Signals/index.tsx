/**
 * Personal Signals page composer.
 *
 * Owns the filter / sort / group / view state for the page and delegates the
 * data fetch + pagination to `useSignalsFeed`. Pinned signals render as a
 * stable top section (loaded once on the first page); the paginated feed
 * renders below, with an IntersectionObserver sentinel that calls
 * `loadMore()` when it scrolls into view.
 *
 * @module pages/Signals
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, X } from "lucide-react";

import { CreateSignalModal } from "../../components/CreateSignal";
import { useAuthContext } from "../../hooks/useAuthContext";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { PILLAR_CODES } from "../../lib/lens-api";
import { togglePin } from "./api";
import { EmptyState } from "./EmptyState";
import { FilterBar } from "./FilterBar";
import { HeroHeader } from "./HeroHeader";
import { SignalGroup } from "./SignalGroup";
import { StatsRow } from "./StatsRow";
import { useSignalsFeed } from "./useSignalsFeed";
import type {
  GroupBy,
  PersonalSignal,
  SortOption,
  SourceFilter,
  ViewMode,
} from "./types";

const SORT_PARAM_MAP: Record<SortOption, string> = {
  recently_updated: "updated",
  date_followed: "followed",
  quality_desc: "quality",
  name_asc: "name",
};

export default function Signals() {
  useAuthContext();

  const [showCreateSignal, setShowCreateSignal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPillar, setSelectedPillar] = useState("");
  const [selectedHorizon, setSelectedHorizon] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("");
  const [qualityMin, setQualityMin] = useState(0);
  const [sortOption, setSortOption] = useState<SortOption>("recently_updated");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [actionError, setActionError] = useState<string | null>(null);

  const { debouncedValue: debouncedSearch } = useDebouncedValue(
    searchTerm,
    300,
  );

  // Materialize the query params object so identity is stable across renders
  // that don't change a filter — keeps `useSignalsFeed` from refetching on
  // every keystroke (the debounced search handles that).
  const queryParams = useMemo<Record<string, string>>(() => {
    const params: Record<string, string> = {
      sort_by: SORT_PARAM_MAP[sortOption],
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (selectedPillar) params.pillar = selectedPillar;
    if (selectedHorizon) params.horizon = selectedHorizon;
    if (sourceFilter) params.source = sourceFilter;
    if (qualityMin > 0) params.quality_min = String(qualityMin);
    return params;
  }, [
    debouncedSearch,
    selectedPillar,
    selectedHorizon,
    sourceFilter,
    qualityMin,
    sortOption,
  ]);

  const {
    signals,
    pinned,
    stats,
    loading,
    isFetchingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    clearError,
    patchSignal,
    patchStats,
  } = useSignalsFeed(queryParams);

  // Infinite scroll sentinel — calls loadMore when the bottom marker enters
  // the viewport. Re-binds whenever loadMore's identity changes (which
  // happens on filter change, intentionally).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "240px 0px" }, // start fetching slightly before the user reaches the bottom
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleTogglePin = useCallback(
    async (cardId: string, currentlyPinned: boolean) => {
      const target =
        signals.find((s) => s.id === cardId) ??
        pinned.find((s) => s.id === cardId);
      const wasFollowed = target?.is_followed ?? false;

      // Optimistic patch: pin + follow flip together.
      patchSignal(cardId, {
        is_pinned: !currentlyPinned,
        is_followed: !currentlyPinned,
      });
      const followDelta = !currentlyPinned
        ? wasFollowed
          ? 0
          : 1
        : wasFollowed
          ? -1
          : 0;
      if (followDelta !== 0) patchStats({ followed_count: followDelta });

      try {
        await togglePin(cardId, !currentlyPinned);
      } catch (err) {
        // Roll back optimistic update.
        patchSignal(cardId, {
          is_pinned: currentlyPinned,
          is_followed: wasFollowed,
        });
        if (followDelta !== 0) patchStats({ followed_count: -followDelta });
        setActionError(
          err instanceof Error
            ? err.message
            : currentlyPinned
              ? "Failed to unpin signal"
              : "Failed to pin signal",
        );
      }
    },
    [signals, pinned, patchSignal, patchStats],
  );

  // Pillar facet options come from the canonical 6-pillar taxonomy, not from
  // the currently-loaded pages. Sourcing from loaded data would hide pillars
  // that exist later in the result set (regressing filtering for large
  // accounts under pagination).
  const uniquePillars = useMemo(() => [...PILLAR_CODES].sort(), []);

  const groupedSignals = useMemo<
    { key: string; label: string; signals: PersonalSignal[] }[]
  >(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "", signals }];
    }

    const groups = new Map<string, PersonalSignal[]>();
    for (const signal of signals) {
      let keys: string[] = [];
      if (groupBy === "pillar") {
        keys = [signal.pillar_id || "Unknown"];
      } else if (groupBy === "horizon") {
        keys = [signal.horizon || "Unknown"];
      } else if (groupBy === "workstream") {
        keys =
          signal.workstream_names.length > 0
            ? signal.workstream_names
            : ["No Workstream"];
      }
      for (const k of keys) {
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(signal);
      }
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, sigs]) => ({ key, label: key, signals: sigs }));
  }, [signals, groupBy]);

  const hasActiveFilters =
    searchTerm !== "" ||
    selectedPillar !== "" ||
    selectedHorizon !== "" ||
    sourceFilter !== "" ||
    qualityMin > 0;

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedPillar("");
    setSelectedHorizon("");
    setSourceFilter("");
    setQualityMin(0);
  };

  const displayedError = actionError ?? error;
  const isEmpty = !loading && pinned.length === 0 && signals.length === 0;
  // FilterBar's result count reflects what's currently loaded plus the
  // server-known total — leaving stats.total as the canonical "you have N
  // signals" answer (matches the empty-vs-filtered messaging in EmptyState).
  const resultCount = pinned.length + signals.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <HeroHeader onCreateClick={() => setShowCreateSignal(true)} />

      <StatsRow stats={stats} />

      <FilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedPillar={selectedPillar}
        onPillarChange={setSelectedPillar}
        uniquePillars={uniquePillars}
        selectedHorizon={selectedHorizon}
        onHorizonChange={setSelectedHorizon}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        sortOption={sortOption}
        onSortChange={setSortOption}
        qualityMin={qualityMin}
        onQualityMinChange={setQualityMin}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        resultCount={resultCount}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      {displayedError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">
                {displayedError}
              </p>
              <button
                onClick={() => {
                  setActionError(null);
                  refresh();
                }}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            </div>
            <button
              onClick={() => {
                setActionError(null);
                clearError();
              }}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              aria-label="Dismiss error"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-brand-blue animate-spin" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Loading your signals...
          </p>
        </div>
      ) : isEmpty ? (
        <EmptyState hasFilters={hasActiveFilters} />
      ) : (
        <div className="space-y-8">
          {pinned.length > 0 && (
            <SignalGroup
              key="pinned"
              label="Pinned"
              // "workstream" hits the plain-text header branch in SignalGroup
              // (PillarBadge / HorizonBadge would try to map "Pinned" to a
              // real pillar/horizon code). Any non-"none"/"pillar"/"horizon"
              // value would do; this is the most semantically neutral choice.
              groupBy="workstream"
              signals={pinned}
              viewMode={viewMode}
              onTogglePin={handleTogglePin}
            />
          )}
          {groupedSignals.map((group) => (
            <SignalGroup
              key={group.key}
              label={group.label}
              groupBy={groupBy}
              signals={group.signals}
              viewMode={viewMode}
              onTogglePin={handleTogglePin}
            />
          ))}
          {/* Infinite-scroll sentinel + load-more indicator.
              The sentinel itself stays visible (no aria-hidden) so the
              status text below it remains discoverable by assistive tech. */}
          <div
            ref={sentinelRef}
            className="h-12 flex items-center justify-center"
          >
            {isFetchingMore && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more…
              </span>
            )}
            {!hasMore && signals.length > 0 && (
              <span
                role="status"
                aria-live="polite"
                className="text-xs text-gray-400 dark:text-gray-500"
              >
                You're all caught up.
              </span>
            )}
          </div>
        </div>
      )}

      <CreateSignalModal
        isOpen={showCreateSignal}
        onClose={() => setShowCreateSignal(false)}
        onSuccess={() => {
          refresh();
          setShowCreateSignal(false);
        }}
      />
    </div>
  );
}
