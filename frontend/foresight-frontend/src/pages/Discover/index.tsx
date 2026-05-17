/**
 * Discover page — the main intelligence library browser.
 *
 * Owns filter state (search, pillar, stage, horizon, sort, score thresholds,
 * date range, semantic toggle, quality tier) and saved-search / sidebar
 * state. Everything else is delegated:
 *
 *   - `useCardLoader`       — loads pillars/stages and re-fetches cards on
 *                             filter changes (3 paths: following, semantic,
 *                             standard supabase)
 *   - `useFollowedCards`    — owns the followed-set + toggle with optimistic
 *                             revert
 *   - `useCompareMode`      — compare mode state + URL/sessionStorage sync
 *   - `useDiscoverScroll`   — virtualized list/grid refs + scroll restoration
 *                             + sort-reset
 *   - `useSearchHistory`    — recent-searches list with debounced record
 *
 * @module Discover
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SaveSearchModal } from "../../components/SaveSearchModal";
import { SearchSidebar } from "../../components/SearchSidebar";
import { useToast } from "../../components/ui/Toast";
import { useAuthContext } from "../../hooks/useAuthContext";
import { useDebouncedValue } from "../../hooks/useDebounce";
import type { SavedSearchQueryConfig } from "../../lib/discovery-api";
import { buildSavedSearchConfig } from "./utils";

import {
  CardsView,
  CompareModeBanner,
  DiscoverCard,
  DiscoverEmptyState,
  DiscoverErrorBanner,
  DiscoverHeader,
  FiltersPanel,
  LensFilterBanner,
  QuickFilterChips,
  SearchHistoryPanel,
  ViewControlsBar,
} from "./components";
import {
  useCardLoader,
  useCompareMode,
  useDiscoverScroll,
  useFollowedCards,
  useSearchHistory,
} from "./hooks";
import type { Card, FilterState, SortOption } from "./types";

const Discover: React.FC = () => {
  const { user } = useAuthContext();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state -----------------------------------------------------------
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPillar, setSelectedPillar] = useState("");
  const [selectedStage, setSelectedStage] = useState("");
  const [selectedHorizon, setSelectedHorizon] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("recently_updated");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [impactMin, setImpactMin] = useState<number>(0);
  const [relevanceMin, setRelevanceMin] = useState<number>(0);
  const [noveltyMin, setNoveltyMin] = useState<number>(0);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [useSemanticSearch, setUseSemanticSearch] = useState<boolean>(false);
  const [qualityFilter, setQualityFilter] = useState<string>("all");

  // Modal + sidebar state --------------------------------------------------
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  // Lens / quick filters parsed from URL -----------------------------------
  const quickFilter = searchParams.get("filter") || "";
  const flagFilter = searchParams.get("flag") || "";
  const confidenceFilter = searchParams.get("confidence") || "";
  const issueTagFilter = searchParams.get("issue_tag") || "";
  const goalFilter = searchParams.get("goal") || "";
  const goalLabel = searchParams.get("goal_label") || "";

  // Debounce fast-changing inputs ------------------------------------------
  const filterState = useMemo<FilterState>(
    () => ({ searchTerm, impactMin, relevanceMin, noveltyMin }),
    [searchTerm, impactMin, relevanceMin, noveltyMin],
  );
  const { debouncedValue: debouncedFilters, isPending: isFilterPending } =
    useDebouncedValue(filterState, 300);

  // Search history ---------------------------------------------------------
  const {
    searchHistory,
    historyLoading,
    isHistoryExpanded,
    toggleHistoryExpanded,
    deletingHistoryId,
    recordSearch,
    deleteHistoryEntry,
    clearHistory,
  } = useSearchHistory(user?.id);

  // Hooks: followed cards, compare mode, scroll restoration ----------------
  const onFollowError = useCallback(
    (message: string) => pushToast(message, { variant: "error" }),
    [pushToast],
  );
  const { followedCardIds, toggleFollow } = useFollowedCards({
    userId: user?.id,
    onError: onFollowError,
  });

  const {
    compareMode,
    selectedForCompare,
    setCompareMode,
    setSelectedForCompare,
    toggleCardForCompare,
    navigateToCompare,
    exitCompareMode,
  } = useCompareMode();

  const { virtualizedListRef, virtualizedGridRef } = useDiscoverScroll({
    viewMode,
    sortOption,
  });

  // Saved-search config used by both the Save Search modal and the
  // search-history "record" calls — kept in sync via one builder.
  const currentQueryConfig = useMemo(
    () =>
      buildSavedSearchConfig({
        searchTerm,
        selectedPillar,
        selectedStage,
        selectedHorizon,
        dateFrom,
        dateTo,
        impactMin,
        relevanceMin,
        noveltyMin,
        useSemanticSearch,
      }),
    [
      searchTerm,
      selectedPillar,
      selectedStage,
      selectedHorizon,
      dateFrom,
      dateTo,
      impactMin,
      relevanceMin,
      noveltyMin,
      useSemanticSearch,
    ],
  );

  // Card loading -----------------------------------------------------------
  const loaderFilters = useMemo(
    () => ({
      searchTerm: debouncedFilters.searchTerm,
      impactMin: debouncedFilters.impactMin,
      relevanceMin: debouncedFilters.relevanceMin,
      noveltyMin: debouncedFilters.noveltyMin,
      selectedPillar,
      selectedStage,
      selectedHorizon,
      dateFrom,
      dateTo,
      useSemanticSearch,
      sortOption,
      quickFilter,
      flagFilter,
      confidenceFilter,
      issueTagFilter,
      goalFilter,
    }),
    [
      debouncedFilters,
      selectedPillar,
      selectedStage,
      selectedHorizon,
      dateFrom,
      dateTo,
      useSemanticSearch,
      sortOption,
      quickFilter,
      flagFilter,
      confidenceFilter,
      issueTagFilter,
      goalFilter,
    ],
  );

  const {
    cards,
    pillars,
    stages,
    loading,
    isFetchingMore,
    hasMore,
    error,
    setError,
    reload,
    loadMore,
  } = useCardLoader({
    filters: loaderFilters,
    currentQueryConfig,
    followedCardIds,
    recordSearch,
  });

  // Only fire `loadMore` when more pages remain and the page isn't already
  // mid-fetch. Guarding here keeps the virtualizer's scroll callback wired
  // to a no-op once we've exhausted the result set.
  const handleEndReached = useCallback(() => {
    if (!hasMore || loading || isFetchingMore) return;
    loadMore();
  }, [hasMore, loading, isFetchingMore, loadMore]);

  // Apply client-side quality tier filter ----------------------------------
  const filteredCards = useMemo(() => {
    if (qualityFilter === "all") return cards;
    return cards.filter((card) => {
      const score = card.signal_quality_score;
      switch (qualityFilter) {
        case "high":
          return score != null && score >= 75;
        case "moderate":
          return score != null && score >= 50 && score < 75;
        case "low":
          return score == null || score < 50;
        default:
          return true;
      }
    });
  }, [cards, qualityFilter]);

  // Mirror ?confidence=high onto the local Quality chip so the UI shows the
  // active state. Driving qualityFilter purely from URL would re-architect
  // the chip click path, so we sync via effect instead.
  useEffect(() => {
    if (confidenceFilter === "high" && qualityFilter !== "high") {
      setQualityFilter("high");
    }
  }, [confidenceFilter, qualityFilter]);

  // Saved-search handlers --------------------------------------------------
  const handleSelectSavedSearch = useCallback(
    (config: SavedSearchQueryConfig) => {
      setSearchTerm(config.query ?? "");
      setUseSemanticSearch(config.use_vector_search ?? false);

      const filters = config.filters ?? {};
      setSelectedPillar(filters.pillar_ids?.[0] ?? "");
      setSelectedStage(filters.stage_ids?.[0] ?? "");
      setSelectedHorizon(
        filters.horizon && filters.horizon !== "ALL" ? filters.horizon : "",
      );
      setDateFrom(filters.date_range?.start ?? "");
      setDateTo(filters.date_range?.end ?? "");
      setImpactMin(filters.score_thresholds?.impact_score?.min ?? 0);
      setRelevanceMin(filters.score_thresholds?.relevance_score?.min ?? 0);
      setNoveltyMin(filters.score_thresholds?.novelty_score?.min ?? 0);

      setSearchParams({});
      setIsSidebarOpen(false);
    },
    [setSearchParams],
  );

  const handleSaveSearchSuccess = useCallback(() => {
    setShowSaveSearchModal(false);
    setSidebarRefreshKey((prev) => prev + 1);
  }, []);

  // Render helpers ---------------------------------------------------------
  const renderCardItem = useCallback(
    (card: Card, index?: number) => {
      const isSelectedForCompare = selectedForCompare.some(
        (c) => c.id === card.id,
      );

      return (
        <div
          className="animate-in fade-in slide-in-from-bottom-2 duration-300"
          style={{
            animationDelay: `${Math.min(index ?? 0, 5) * 50}ms`,
            animationFillMode: "both",
          }}
        >
          <DiscoverCard
            card={card}
            compareMode={compareMode}
            isSelectedForCompare={isSelectedForCompare}
            isFollowed={followedCardIds.has(card.id)}
            searchTerm={searchTerm}
            onToggleCompare={toggleCardForCompare}
            onToggleFollow={toggleFollow}
          />
        </div>
      );
    },
    [
      compareMode,
      selectedForCompare,
      followedCardIds,
      searchTerm,
      toggleCardForCompare,
      toggleFollow,
    ],
  );

  // Derived UI flags -------------------------------------------------------
  const hasActiveScalarFilters =
    !!selectedPillar ||
    !!selectedStage ||
    !!selectedHorizon ||
    !!dateFrom ||
    !!dateTo ||
    impactMin > 0 ||
    relevanceMin > 0 ||
    noveltyMin > 0;

  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedPillar("");
    setSelectedStage("");
    setSelectedHorizon("");
    setDateFrom("");
    setDateTo("");
    setImpactMin(0);
    setRelevanceMin(0);
    setNoveltyMin(0);
    setUseSemanticSearch(false);
  };

  const clearLensFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("flag");
    next.delete("confidence");
    next.delete("issue_tag");
    next.delete("goal");
    next.delete("goal_label");
    setSearchParams(next);
  };

  return (
    <>
      <SearchSidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onSelectSearch={handleSelectSavedSearch}
        refreshKey={sidebarRefreshKey}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DiscoverHeader
          compareMode={compareMode}
          isSidebarOpen={isSidebarOpen}
          onToggleCompare={() =>
            compareMode ? exitCompareMode() : setCompareMode(true)
          }
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        <LensFilterBanner
          flagFilter={flagFilter}
          confidenceFilter={confidenceFilter}
          issueTagFilter={issueTagFilter}
          goalFilter={goalFilter}
          goalLabel={goalLabel}
          matchCount={filteredCards.length}
          onClear={clearLensFilters}
        />

        <QuickFilterChips
          quickFilter={quickFilter}
          qualityFilter={qualityFilter}
          onSetQuickFilter={(value) =>
            setSearchParams(value ? { filter: value } : {})
          }
          onSetQualityFilter={setQualityFilter}
        />

        <FiltersPanel
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          useSemanticSearch={useSemanticSearch}
          onToggleSemanticSearch={setUseSemanticSearch}
          pillars={pillars}
          selectedPillar={selectedPillar}
          onSelectedPillarChange={setSelectedPillar}
          stages={stages}
          selectedStage={selectedStage}
          onSelectedStageChange={setSelectedStage}
          selectedHorizon={selectedHorizon}
          onSelectedHorizonChange={setSelectedHorizon}
          sortOption={sortOption}
          onSortOptionChange={setSortOption}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          impactMin={impactMin}
          onImpactMinChange={setImpactMin}
          relevanceMin={relevanceMin}
          onRelevanceMinChange={setRelevanceMin}
          noveltyMin={noveltyMin}
          onNoveltyMinChange={setNoveltyMin}
          footer={
            user?.id ? (
              <SearchHistoryPanel
                history={searchHistory}
                isExpanded={isHistoryExpanded}
                isLoading={historyLoading}
                deletingId={deletingHistoryId}
                onToggleExpanded={toggleHistoryExpanded}
                onSelectEntry={handleSelectSavedSearch}
                onDeleteEntry={deleteHistoryEntry}
                onClearAll={clearHistory}
              />
            ) : null
          }
        />

        <ViewControlsBar
          visibleCount={filteredCards.length}
          totalCount={cards.length}
          isFilterPending={isFilterPending}
          hasQualityFilter={qualityFilter !== "all"}
          viewMode={viewMode}
          onSetViewMode={setViewMode}
          onOpenSaveSearch={() => setShowSaveSearchModal(true)}
        />

        {compareMode && (
          <CompareModeBanner
            selectedForCompare={selectedForCompare}
            onClearSelection={() => setSelectedForCompare([])}
            onNavigateToCompare={navigateToCompare}
            onExitCompareMode={exitCompareMode}
            onToggleCardForCompare={toggleCardForCompare}
          />
        )}

        {error && (
          <DiscoverErrorBanner
            message={error}
            onRetry={() => {
              setError(null);
              reload();
            }}
            onDismiss={() => setError(null)}
          />
        )}

        {loading || isFilterPending ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue"></div>
            {isFilterPending && !loading && (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Updating search...
              </p>
            )}
          </div>
        ) : filteredCards.length === 0 && !error ? (
          <DiscoverEmptyState
            searchTerm={searchTerm}
            useSemanticSearch={useSemanticSearch}
            hasActiveFilters={hasActiveScalarFilters}
            quickFilter={quickFilter}
            onClearFilters={clearAllFilters}
            onDisableSemantic={() => setUseSemanticSearch(false)}
          />
        ) : filteredCards.length > 0 ? (
          <CardsView
            viewMode={viewMode}
            cards={filteredCards}
            renderItem={renderCardItem}
            listRef={virtualizedListRef}
            gridRef={virtualizedGridRef}
            onEndReached={handleEndReached}
            isFetchingMore={isFetchingMore}
          />
        ) : null}

        <SaveSearchModal
          isOpen={showSaveSearchModal}
          onClose={() => setShowSaveSearchModal(false)}
          onSuccess={handleSaveSearchSuccess}
          queryConfig={currentQueryConfig}
        />
      </div>
    </>
  );
};

export default Discover;
