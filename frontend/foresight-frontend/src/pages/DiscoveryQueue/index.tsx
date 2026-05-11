/**
 * Composer for the Discovery Queue page. Owns the top-level data fetch
 * (`fetchPendingReviewCards`, `pillars`), the filter/selection state, and
 * wires together the sub-modules: `Header`, `Filters`, `BulkActionsBar`,
 * `EmptyState`, `PendingCardRow` (inside a `SwipeableCard` row), `UndoToast`,
 * plus the `useReviewActions` / `useUndoStack` / `useUndoToast` /
 * `useDiscoveryHotkeys` hooks.
 *
 * Single-source-of-truth state lives here; the sub-modules are largely
 * presentational so individual rows don't re-render when only filter state
 * changes.
 *
 * @module pages/DiscoveryQueue
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getAuthToken } from "../../lib/auth";
import { useAuthContext } from "../../hooks/useAuthContext";
import { useIsMobile } from "../../hooks/use-mobile";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import { cn } from "../../lib/utils";
import {
  VirtualizedList,
  VirtualizedListHandle,
} from "../../components/VirtualizedList";
import {
  fetchPendingReviewCards,
  type PendingCard,
} from "../../lib/discovery-api";
import { BulkActionsBar } from "./BulkActionsBar";
import { EmptyState } from "./EmptyState";
import { Filters } from "./Filters";
import { Header } from "./Header";
import { KeyboardShortcutsHint } from "./KeyboardShortcutsHint";
import { PendingCardRow } from "./PendingCardRow";
import { SwipeableCard } from "./SwipeableCard";
import { UndoToast } from "./UndoToast";
import type { ConfidenceFilter, Pillar, UndoAction } from "./types";
import { filterByConfidence } from "./utils";
import { useDiscoveryHotkeys } from "./useDiscoveryHotkeys";
import { useReviewActions } from "./useReviewActions";
import { useUndoStack } from "./useUndoStack";
import { useUndoToast } from "./useUndoToast";

const SCROLL_RESTORATION_OPTIONS = {
  storageKey: "discovery-queue",
  clearAfterRestore: false,
  debounce: true,
  debounceDelay: 100,
} as const;

const DiscoveryQueue: React.FC = () => {
  const { user } = useAuthContext();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Stable scroll-restoration options — useMemo prevents the object identity
  // from changing on each render, which previously caused an infinite re-render
  // crash (React error #301) when the hook re-ran on every change.
  const scrollRestorationOptions = useMemo(
    () => SCROLL_RESTORATION_OPTIONS,
    [],
  );
  useScrollRestoration(scrollRestorationOptions);

  const [cards, setCards] = useState<PendingCard[]>([]);
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [initialCardCount, setInitialCardCount] = useState<number>(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPillar, setSelectedPillar] = useState("");
  const [confidenceFilter, setConfidenceFilter] =
    useState<ConfidenceFilter>("all");

  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const showBulkActions = selectedCards.size > 0;

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [focusedCardIndex, setFocusedCardIndex] = useState<number>(-1);
  const virtualizedListRef = useRef<VirtualizedListHandle>(null);

  // Cache of stable ref callbacks per card id — prevents new function
  // references on each render so `SwipeableCard` (React.memo) doesn't churn.
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const cardRefCallbacksCache = useRef<
    Map<string, (el: HTMLDivElement | null) => void>
  >(new Map());

  const restoreCard = useCallback((card: PendingCard) => {
    setCards((prev) => {
      if (prev.some((c) => c.id === card.id)) return prev;
      return [...prev, card];
    });
  }, []);

  const removeCard = useCallback((cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  }, []);

  const removeCards = useCallback((cardIds: string[]) => {
    const idSet = new Set(cardIds);
    setCards((prev) => prev.filter((c) => !idSet.has(c.id)));
  }, []);

  const deselectCard = useCallback((cardId: string) => {
    setSelectedCards((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCards(new Set());
  }, []);

  const closeDropdown = useCallback(() => setOpenDropdown(null), []);

  const { pushToUndoStack, undoLastAction, canUndo, getLastUndoableAction } =
    useUndoStack({ restoreCard });

  const undoToast = useUndoToast();

  const {
    actionLoading,
    error: actionError,
    handleReview,
    handleDismiss,
    handleBulk,
  } = useReviewActions({
    user,
    cards,
    removeCard,
    removeCards,
    deselectCard,
    clearSelection,
    pushToUndoStack,
    showUndoToast: undoToast.show,
    closeDropdown,
  });

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setLoadError(null);

      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");

      const { data: pillarsData } = await supabase
        .from("pillars")
        .select("*")
        .order("name");
      setPillars(pillarsData || []);

      const pendingCards = await fetchPendingReviewCards(token);
      setCards(pendingCards);
      if (pendingCards.length > 0) {
        setInitialCardCount(pendingCards.length);
      }
    } catch (err) {
      console.error("Error loading discovery queue:", err);
      setLoadError(
        err instanceof Error ? err.message : "Failed to load discovery queue",
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stable swipe callbacks; pass cardId through the SwipeableCard contract so
  // we keep ONE function identity per render instead of one per row.
  const handleSwipeApprove = useCallback(
    (cardId: string) => handleReview(cardId, "approve"),
    [handleReview],
  );

  const handleSwipeDismiss = useCallback(
    (cardId: string) => handleDismiss(cardId, "irrelevant"),
    [handleDismiss],
  );

  const filteredCards = useMemo(() => {
    let result = cards;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (card) =>
          card.name.toLowerCase().includes(term) ||
          card.summary.toLowerCase().includes(term),
      );
    }

    if (selectedPillar) {
      result = result.filter((card) => card.pillar_id === selectedPillar);
    }

    result = filterByConfidence(result, confidenceFilter);

    return result;
  }, [cards, searchTerm, selectedPillar, confidenceFilter]);

  const openCardDetail = useCallback(
    (card: PendingCard) => {
      if (!card.slug) return;
      navigate(`/signals/${encodeURIComponent(card.slug)}?mode=review`);
    },
    [navigate],
  );

  const toggleCardSelection = useCallback((cardId: string) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedCards(new Set(filteredCards.map((c) => c.id)));
  }, [filteredCards]);

  const stats = useMemo(() => {
    const high = cards.filter((c) => c.ai_confidence >= 0.9).length;
    const medium = cards.filter(
      (c) => c.ai_confidence >= 0.7 && c.ai_confidence < 0.9,
    ).length;
    const low = cards.filter((c) => c.ai_confidence < 0.7).length;
    return { total: cards.length, high, medium, low };
  }, [cards]);

  const progressStats = useMemo(() => {
    const reviewed = initialCardCount - cards.length;
    const total = initialCardCount;
    const percentage = total > 0 ? (reviewed / total) * 100 : 0;
    return { reviewed, total, percentage };
  }, [cards.length, initialCardCount]);

  const focusedCardId =
    focusedCardIndex >= 0 && focusedCardIndex < filteredCards.length
      ? filteredCards[focusedCardIndex]!.id
      : null;

  const navigateNext = useCallback(() => {
    if (filteredCards.length === 0) return;
    setFocusedCardIndex((prev) => {
      const nextIndex = prev < filteredCards.length - 1 ? prev + 1 : 0;
      virtualizedListRef.current?.scrollToIndex(nextIndex, { align: "center" });
      return nextIndex;
    });
  }, [filteredCards.length]);

  const navigatePrevious = useCallback(() => {
    if (filteredCards.length === 0) return;
    setFocusedCardIndex((prev) => {
      const nextIndex = prev > 0 ? prev - 1 : filteredCards.length - 1;
      virtualizedListRef.current?.scrollToIndex(nextIndex, { align: "center" });
      return nextIndex;
    });
  }, [filteredCards.length]);

  const approveFocused = useCallback(() => {
    if (focusedCardId) handleReview(focusedCardId, "approve");
  }, [focusedCardId, handleReview]);

  const dismissFocused = useCallback(() => {
    if (focusedCardId) handleDismiss(focusedCardId, "irrelevant");
  }, [focusedCardId, handleDismiss]);

  const undoAndDismissToast = useCallback(() => {
    undoLastAction();
    undoToast.dismiss();
  }, [undoLastAction, undoToast]);

  useDiscoveryHotkeys({
    navigateNext,
    navigatePrevious,
    canAct: Boolean(focusedCardId) && !actionLoading,
    approveFocused,
    dismissFocused,
    canUndo: undoToast.visible && canUndo(),
    undo: undoAndDismissToast,
  });

  // Keep focus in-bounds when filters change the visible list.
  useEffect(() => {
    if (focusedCardIndex >= filteredCards.length) {
      setFocusedCardIndex(filteredCards.length > 0 ? 0 : -1);
    }
  }, [filteredCards.length, focusedCardIndex]);

  /**
   * Stable ref-callback factory: returns the same function identity for a
   * given cardId across renders, so SwipeableCard's memo comparator can
   * compare by reference.
   */
  const getCardRefCallback = useCallback((cardId: string) => {
    let callback = cardRefCallbacksCache.current.get(cardId);
    if (!callback) {
      callback = (el: HTMLDivElement | null) => {
        if (el) {
          cardRefs.current.set(cardId, el);
        } else {
          cardRefs.current.delete(cardId);
        }
      };
      cardRefCallbacksCache.current.set(cardId, callback);
    }
    return callback;
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedPillar("");
    setConfidenceFilter("all");
  }, []);

  const lastUndoableAction = getLastUndoableAction();
  const displayError = actionError ?? loadError;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
      <Header
        loading={loading}
        isMobile={isMobile}
        onRefresh={loadData}
        stats={stats}
        progress={progressStats}
      />

      {displayError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">{displayError}</span>
          </div>
        </div>
      )}

      <Filters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedPillar={selectedPillar}
        onPillarChange={setSelectedPillar}
        confidenceFilter={confidenceFilter}
        onConfidenceChange={setConfidenceFilter}
        pillars={pillars}
        filteredCount={filteredCards.length}
        totalCount={cards.length}
        selectedCount={selectedCards.size}
        onSelectAll={selectAllVisible}
        onClearSelection={clearSelection}
      />

      {!isMobile && !showBulkActions && filteredCards.length > 0 && (
        <KeyboardShortcutsHint />
      )}

      {isMobile && filteredCards.length > 0 && !showBulkActions && (
        <div className="mb-3 px-3 py-2 bg-gray-50 dark:bg-dark-surface/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            Swipe right to approve • Swipe left to dismiss
          </p>
        </div>
      )}

      {showBulkActions && (
        <BulkActionsBar
          selectedCount={selectedCards.size}
          isMobile={isMobile}
          isProcessing={actionLoading === "bulk"}
          onAction={(action) => handleBulk(action, selectedCards)}
          onCancel={clearSelection}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue"></div>
        </div>
      ) : filteredCards.length === 0 ? (
        <EmptyState
          queueIsEmpty={cards.length === 0}
          onClearFilters={clearAllFilters}
        />
      ) : (
        <VirtualizedList<PendingCard>
          ref={virtualizedListRef}
          items={filteredCards}
          estimatedSize={200}
          gap={isMobile ? 12 : 16}
          overscan={3}
          getItemKey={(card) => card.id}
          focusedIndex={focusedCardIndex}
          onFocusedIndexChange={setFocusedCardIndex}
          onItemClick={openCardDetail}
          ariaLabel="Discovery queue signals"
          scrollContainerClassName="h-[calc(100vh-280px)] sm:h-[calc(100vh-300px)]"
          renderItem={(card) => {
            const isSelected = selectedCards.has(card.id);
            const isLoading = actionLoading === card.id;
            const isDropdownOpen = openDropdown === card.id;
            const isFocused = focusedCardId === card.id;

            return (
              <SwipeableCard
                cardId={card.id}
                isMobile={isMobile}
                cardRef={getCardRefCallback(card.id)}
                onSwipeRight={handleSwipeApprove}
                onSwipeLeft={handleSwipeDismiss}
                disabled={isLoading}
                tabIndex={isFocused ? 0 : -1}
                className={cn(
                  "bg-white dark:bg-dark-surface rounded-lg shadow p-4 sm:p-6 border-l-4 transition-all duration-200 cursor-pointer",
                  isFocused
                    ? "border-l-brand-blue ring-2 ring-brand-blue/50 shadow-lg"
                    : isSelected
                      ? "border-l-brand-blue ring-2 ring-brand-blue/20"
                      : "border-transparent hover:border-l-brand-blue",
                  isLoading && "opacity-60",
                )}
              >
                <PendingCardRow
                  card={card}
                  isMobile={isMobile}
                  isSelected={isSelected}
                  isLoading={isLoading}
                  isDropdownOpen={isDropdownOpen}
                  onToggleSelect={toggleCardSelection}
                  onOpenDropdown={setOpenDropdown}
                  onReview={handleReview}
                  onDismiss={handleDismiss}
                />
              </SwipeableCard>
            );
          }}
        />
      )}

      {openDropdown && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setOpenDropdown(null)}
        />
      )}

      {undoToast.visible && lastUndoableAction && (
        <UndoToast
          action={lastUndoableAction as UndoAction}
          onUndo={undoAndDismissToast}
          onDismiss={undoToast.dismiss}
          timeRemaining={undoToast.timeRemaining}
        />
      )}
    </div>
  );
};

export default DiscoveryQueue;
