/**
 * Loads pillar/stage taxonomies once and re-loads the visible signal cards
 * whenever any filter (debounced search, pillar/stage/horizon, lens filters,
 * date range, sort, semantic toggle, following filter) changes.
 *
 * Owns `cards / pillars / stages / loading / error`. The composer keeps all
 * filter inputs as state and hands them in via `filters` — the hook stays
 * pure I/O.
 *
 * @module pages/Discover/hooks/useCardLoader
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthToken } from "../../../lib/auth";
import { getCardsArtifacts } from "../../../lib/card-artifacts-api";
import { getCardsFollowerStatus } from "../../../lib/card-followers-api";
import {
  advancedSearch,
  type AdvancedSearchRequest,
  type SavedSearchQueryConfig,
} from "../../../lib/discovery-api";
import { supabase } from "../../../lib/supabase";
import type { Card, Pillar, SortOption, Stage } from "../types";
import { getSortConfig } from "../utils";

const PAGE_SIZE = 30;

/**
 * Cap how many consecutive empty pages `fetchPage` will hop over when the
 * semantic path's post-slice `quickFilter === "new" | "updated"` drops every
 * row in a fetched page. Without this bound, a filter that matches nothing
 * in the dataset would scan the entire result set in one `loadMore()` call.
 * 5 hops × PAGE_SIZE = up to 150 raw server rows considered per page request,
 * which is a sensible upper bound for an interactive scroll-to-load.
 *
 * Quality-tier filtering moved server-side (see backend `quality_filter`),
 * so the only remaining client-side filters that can empty a semantic page
 * are the two date-based quickFilters, both of which have natural bounds.
 */
const MAX_EMPTY_PAGE_HOPS = 5;

export interface CardLoaderFilters {
  searchTerm: string;
  impactMin: number;
  relevanceMin: number;
  noveltyMin: number;
  selectedPillar: string;
  selectedStage: string;
  selectedHorizon: string;
  dateFrom: string;
  dateTo: string;
  useSemanticSearch: boolean;
  sortOption: SortOption;
  quickFilter: string;
  flagFilter: string;
  confidenceFilter: string;
  issueTagFilter: string;
  goalFilter: string;
  /**
   * Quality-tier chip. Applied server-side via the same
   * `signal_quality_score` column used by `confidenceFilter` so pagination
   * doesn't starve when the first page happens to contain no cards in the
   * selected tier. Typed as a literal union so the compiler rejects any
   * other string (which would silently disable tier filtering).
   */
  qualityFilter: "all" | "high" | "moderate" | "low";
}

export type QualityFilter = CardLoaderFilters["qualityFilter"];

export interface UseCardLoaderArgs {
  filters: CardLoaderFilters;
  /** Built from the current filter state so we can record what was loaded. */
  currentQueryConfig: SavedSearchQueryConfig;
  /** Snapshot of followed card ids — used when `quickFilter === "following"`. */
  followedCardIds: Set<string>;
  /** Push entry into recent-search history when a free-text/semantic search runs. */
  recordSearch: (config: SavedSearchQueryConfig, resultCount: number) => void;
}

export interface UseCardLoaderReturn {
  cards: Card[];
  pillars: Pillar[];
  stages: Stage[];
  loading: boolean;
  /** True while a follow-up `loadMore()` page is in flight. */
  isFetchingMore: boolean;
  /** True when more pages remain server-side. */
  hasMore: boolean;
  error: string | null;
  setError: (value: string | null) => void;
  /** Imperative re-fetch (used by error-banner "Try again" button). */
  reload: () => void;
  /** Fetch the next page; safe to call repeatedly while loading. */
  loadMore: () => void;
}

/**
 * One fetched page. `cards` is what the UI shows; `cursorAdvance` is the
 * number the caller must add to its server-side cursor.
 *
 * For the standard / following paths the two are equal (server filters apply
 * before the page is sliced). For the semantic path they diverge: the server
 * returns up to PAGE_SIZE results from offset N, and the client further
 * filters by `quickFilter === "new"/"updated"`. The cursor must advance by
 * the number of raw server rows consumed (so the next request asks for the
 * NEXT page) — not by the smaller filtered card count, which would re-fetch
 * already-seen rows.
 */
interface FetchPageResult {
  cards: Card[];
  hasMore: boolean;
  cursorAdvance: number;
}

/**
 * Sanitize free-text input for a PostgREST `.or(...)` filter expression.
 *
 * Three character classes must be neutralized:
 *   - `%` / `_` are PostgreSQL `LIKE` metacharacters; Supabase `.ilike` does
 *     NOT escape them, so a raw user `%` becomes "match anything".
 *   - `,` is parsed as the OR-branch delimiter in PostgREST filter strings.
 *   - `(` / `)` are reserved by the PostgREST OR-expression grammar.
 *
 * We drop these characters rather than backslash-escape because the search
 * field is short user-controlled text and the metacharacters carry no useful
 * substring-match intent. Mirrors `escapeKeywordForOr` in
 * `pages/WorkstreamFeed/api.ts` — keep the two definitions in sync if you
 * change either.
 */
function escapeSearchTermForOr(term: string): string {
  // Also strip `\` — PostgreSQL LIKE/ILIKE treats backslash as the default
  // escape char, so `\%` / `\_` would otherwise match literal `%`/`_` rather
  // than acting as plain text. Keep in sync with `escapeKeywordForOr` in
  // `pages/WorkstreamFeed/api.ts`.
  return term
    .replace(/[%_\\]/g, " ")
    .replace(/[,()]/g, " ")
    .trim();
}

async function hydrateCardCollab(rawCards: Card[]): Promise<Card[]> {
  const token = await getAuthToken();
  if (!token || rawCards.length === 0) return rawCards;
  try {
    const cardIds = rawCards.map((card) => card.id);
    const [artifacts, followerStatus] = await Promise.all([
      getCardsArtifacts(token, cardIds),
      getCardsFollowerStatus(token, cardIds),
    ]);
    return rawCards.map((card) => ({
      ...card,
      artifacts: artifacts[card.id],
      follower_count: followerStatus[card.id]?.follower_count ?? 0,
      is_following: followerStatus[card.id]?.is_following ?? false,
    }));
  } catch {
    return rawCards;
  }
}

function classifyError(err: unknown): string {
  const errorMessage =
    err instanceof Error ? err.message : "An unexpected error occurred";

  if (err instanceof TypeError && err.message.includes("fetch")) {
    return "Network error: Unable to connect to the server.";
  }
  if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
    return "Authentication error: Please sign in to use advanced search features.";
  }
  if (errorMessage.includes("500")) {
    return "Server error: The search service is temporarily unavailable.";
  }
  if (errorMessage.includes("timeout")) {
    return "Request timeout: Try narrowing your filters.";
  }
  return `Failed to load signals: ${errorMessage}`;
}

export function useCardLoader({
  filters,
  currentQueryConfig,
  followedCardIds,
  recordSearch,
}: UseCardLoaderArgs): UseCardLoaderReturn {
  const [cards, setCards] = useState<Card[]>([]);
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Synchronous re-entry guard for loadMore. The `isFetchingMore` state can't
  // block calls that arrive before the React commit lands, so two rapid
  // scroll-driven `onEndReached` fires in the same tick would both pass the
  // state check and double-advance `offsetRef`, skipping a page. The ref is
  // mutated synchronously so the second call's gate sees the in-flight flag.
  const isFetchingMoreRef = useRef(false);

  // Cursor + filter snapshot for the in-flight fetch. The cursor advances by
  // PAGE_SIZE as pages append. The snapshot lets `loadMore()` re-issue the
  // SAME filter set even if `filters` has since changed — late pages from a
  // stale filter would otherwise pollute the new result set.
  const offsetRef = useRef(0);
  const inflightTokenRef = useRef(0);
  const activeFiltersRef = useRef<CardLoaderFilters | null>(null);
  const activeFollowedRef = useRef<Set<string>>(new Set());

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  // Load pillar/stage taxonomies once.
  useEffect(() => {
    (async () => {
      try {
        const { data: pillarsData } = await supabase
          .from("pillars")
          .select("*")
          .order("name");
        const { data: stagesData } = await supabase
          .from("stages")
          .select("*")
          .order("sort_order");
        setPillars(pillarsData || []);
        setStages(stagesData || []);
      } catch (e) {
        console.error("Error loading discover data:", e);
      }
    })();
  }, []);

  // Fetch a single page of cards using the active filters. Returns
  // {cards, hasMore} so the caller can decide whether to allow further
  // pagination. Each of the three filter paths (following / semantic /
  // standard) supports offset+limit pagination.
  const fetchPage = useCallback(
    async (
      activeFilters: CardLoaderFilters,
      followed: Set<string>,
      offset: number,
    ): Promise<FetchPageResult> => {
      const {
        searchTerm,
        impactMin,
        relevanceMin,
        noveltyMin,
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
        qualityFilter,
      } = activeFilters;

      // -- Path 1: "following" filter ---------------------------------------
      if (quickFilter === "following") {
        if (followed.size === 0) {
          return { cards: [], hasMore: false, cursorAdvance: 0 };
        }

        let query = supabase
          .from("cards")
          .select("*")
          .eq("status", "active")
          .in("id", Array.from(followed));

        if (searchTerm) {
          const safeTerm = escapeSearchTermForOr(searchTerm);
          if (safeTerm) {
            query = query.or(
              `name.ilike.%${safeTerm}%,summary.ilike.%${safeTerm}%`,
            );
          }
        }
        if (selectedPillar) query = query.eq("pillar_id", selectedPillar);
        if (selectedStage) query = query.eq("stage_id", selectedStage);
        if (selectedHorizon) query = query.eq("horizon", selectedHorizon);
        if (impactMin > 0) query = query.gte("impact_score", impactMin);
        if (relevanceMin > 0)
          query = query.gte("relevance_score", relevanceMin);
        if (noveltyMin > 0) query = query.gte("novelty_score", noveltyMin);
        if (dateFrom) query = query.gte("created_at", dateFrom);
        if (dateTo) query = query.lte("created_at", dateTo);
        if (flagFilter === "budget")
          query = query.gte("budget_assessment->relevance", 60);
        if (flagFilter === "climate")
          query = query.gte("climate_assessment->relevance", 60);
        if (confidenceFilter === "high")
          query = query.gte("signal_quality_score", 75);
        if (issueTagFilter)
          query = query.contains("issue_tags", [issueTagFilter]);
        if (goalFilter) query = query.contains("csp_goal_ids", [goalFilter]);
        // Quality-tier chip — server-side so pagination doesn't stall when
        // the first page contains no cards in the selected tier.
        if (qualityFilter === "high") {
          query = query.gte("signal_quality_score", 75);
        } else if (qualityFilter === "moderate") {
          query = query
            .gte("signal_quality_score", 50)
            .lt("signal_quality_score", 75);
        } else if (qualityFilter === "low") {
          // "Low" means scored < 50 OR not scored at all (null).
          query = query.or(
            "signal_quality_score.lt.50,signal_quality_score.is.null",
          );
        }

        const sortConfig = getSortConfig(sortOption);
        // Fetch PAGE_SIZE+1 to detect has_more without a separate count.
        const { data } = await query
          .order(sortConfig.column, { ascending: sortConfig.ascending })
          .range(offset, offset + PAGE_SIZE);
        const rows = (data ?? []) as Card[];
        const hasMore = rows.length > PAGE_SIZE;
        const slice = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
        const hydrated = await hydrateCardCollab(slice);
        // Server-side filtered — cursor advances by what we keep.
        return { cards: hydrated, hasMore, cursorAdvance: slice.length };
      }

      // -- Path 2: semantic search ------------------------------------------
      if (useSemanticSearch && searchTerm.trim()) {
        const token = await getAuthToken();
        if (token) {
          // Quality tier is enforced server-side via filters.quality_filter
          // so the semantic path obeys the same constraint as the standard
          // Supabase path. Without this the chip would silently no-op when
          // the user enables semantic search.
          const semanticQuality =
            qualityFilter === "high" ||
            qualityFilter === "moderate" ||
            qualityFilter === "low"
              ? qualityFilter
              : undefined;
          const searchRequest: AdvancedSearchRequest = {
            query: searchTerm,
            use_vector_search: true,
            filters: {
              ...(selectedPillar && { pillar_ids: [selectedPillar] }),
              ...(selectedStage && { stage_ids: [selectedStage] }),
              ...(selectedHorizon && {
                horizon: selectedHorizon as "H1" | "H2" | "H3",
              }),
              ...((dateFrom || dateTo) && {
                date_range: {
                  ...(dateFrom && { start: dateFrom }),
                  ...(dateTo && { end: dateTo }),
                },
              }),
              ...((impactMin > 0 || relevanceMin > 0 || noveltyMin > 0) && {
                score_thresholds: {
                  ...(impactMin > 0 && {
                    impact_score: { min: impactMin },
                  }),
                  ...(relevanceMin > 0 && {
                    relevance_score: { min: relevanceMin },
                  }),
                  ...(noveltyMin > 0 && {
                    novelty_score: { min: noveltyMin },
                  }),
                },
              }),
              ...(semanticQuality && { quality_filter: semanticQuality }),
            },
            // Over-fetch by 1 to derive has_more.
            limit: PAGE_SIZE + 1,
            offset,
          };

          const response = await advancedSearch(token, searchRequest);
          const rawResults = response.results;
          const hasMore = rawResults.length > PAGE_SIZE;
          const sliced = hasMore ? rawResults.slice(0, PAGE_SIZE) : rawResults;
          // Cursor advances by raw server rows consumed (the PAGE_SIZE slice we
          // map into cards). Client-side `new`/`updated` quick filters below
          // may drop some of those cards, but the server has already returned
          // those rows — the next page must start AFTER them, not before, or
          // we'd re-fetch the rows we just filtered out. If the quickFilters
          // empty the page entirely, `fetchPageWithEmptyHop` (caller-side)
          // will request the next page transparently so pagination doesn't
          // stall on a transiently empty result set.
          const cursorAdvance = sliced.length;

          let mappedCards: Card[] = sliced.map((result) => ({
            id: result.id,
            name: result.name,
            slug: result.slug,
            summary: result.summary || result.description || "",
            pillar_id: result.pillar_id || "",
            stage_id: result.stage_id || "",
            horizon: (result.horizon as "H1" | "H2" | "H3") || "H1",
            novelty_score: result.novelty_score || 0,
            maturity_score: result.maturity_score || 0,
            impact_score: result.impact_score || 0,
            relevance_score: result.relevance_score || 0,
            velocity_score: result.velocity_score || 0,
            risk_score: result.risk_score || 0,
            opportunity_score: result.opportunity_score || 0,
            created_at: result.created_at || "",
            updated_at: result.updated_at,
            anchor_id: result.anchor_id,
            search_relevance: result.search_relevance,
          }));

          // Apply quick filters client-side for semantic search results.
          if (quickFilter === "new") {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            mappedCards = mappedCards.filter(
              (c) => c.created_at >= oneWeekAgo.toISOString(),
            );
          }
          if (quickFilter === "updated") {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            mappedCards = mappedCards.filter(
              (c) => (c.updated_at ?? c.created_at) >= oneWeekAgo.toISOString(),
            );
          }

          const sortConfig = getSortConfig(sortOption);
          mappedCards = mappedCards.sort((a, b) => {
            const aVal =
              sortConfig.column === "created_at"
                ? a.created_at
                : a.updated_at || a.created_at;
            const bVal =
              sortConfig.column === "created_at"
                ? b.created_at
                : b.updated_at || b.created_at;
            const comparison = aVal.localeCompare(bVal);
            return sortConfig.ascending ? comparison : -comparison;
          });

          const hydrated = await hydrateCardCollab(mappedCards);
          return { cards: hydrated, hasMore, cursorAdvance };
        }
        // No token — fall through to the standard supabase path so the user
        // still sees results (server-side semantic search needs auth).
      }

      // -- Path 3: standard Supabase query ----------------------------------
      let query = supabase.from("cards").select("*").eq("status", "active");

      if (quickFilter === "new") {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        query = query.gte("created_at", oneWeekAgo.toISOString());
      }

      if (quickFilter === "updated") {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        query = query.gte("updated_at", oneWeekAgo.toISOString());
      }

      if (selectedPillar) query = query.eq("pillar_id", selectedPillar);
      if (selectedStage) query = query.eq("stage_id", selectedStage);
      if (selectedHorizon) query = query.eq("horizon", selectedHorizon);
      if (searchTerm) {
        const safeTerm = escapeSearchTermForOr(searchTerm);
        if (safeTerm) {
          query = query.or(
            `name.ilike.%${safeTerm}%,summary.ilike.%${safeTerm}%`,
          );
        }
      }
      if (impactMin > 0) query = query.gte("impact_score", impactMin);
      if (relevanceMin > 0) query = query.gte("relevance_score", relevanceMin);
      if (noveltyMin > 0) query = query.gte("novelty_score", noveltyMin);
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo);

      // Lens filters (Dashboard tile click-throughs).
      // PostgREST allows JSONB-path filtering via foo->bar; pass the
      // threshold as numeric — PostgREST coerces JSONB to numeric for gte.
      if (flagFilter === "budget") {
        query = query.gte("budget_assessment->relevance", 60);
      }
      if (flagFilter === "climate") {
        query = query.gte("climate_assessment->relevance", 60);
      }
      if (confidenceFilter === "high") {
        query = query.gte("signal_quality_score", 75);
      }
      if (issueTagFilter) {
        query = query.contains("issue_tags", [issueTagFilter]);
      }
      if (goalFilter) {
        query = query.contains("csp_goal_ids", [goalFilter]);
      }
      // Quality-tier chip — same predicate shape as the following path; lives
      // server-side so pagination keeps loading pages until the filter is
      // exhausted (was previously a client-side filter that could empty a
      // page after .range() had already capped the row count).
      if (qualityFilter === "high") {
        query = query.gte("signal_quality_score", 75);
      } else if (qualityFilter === "moderate") {
        query = query
          .gte("signal_quality_score", 50)
          .lt("signal_quality_score", 75);
      } else if (qualityFilter === "low") {
        query = query.or(
          "signal_quality_score.lt.50,signal_quality_score.is.null",
        );
      }

      const sortConfig = getSortConfig(sortOption);
      const { data } = await query
        .order(sortConfig.column, { ascending: sortConfig.ascending })
        .range(offset, offset + PAGE_SIZE);
      const rows = (data ?? []) as Card[];
      const hasMore = rows.length > PAGE_SIZE;
      const slice = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      const hydrated = await hydrateCardCollab(slice);
      // Server-side filtered — cursor advances by what we keep.
      return { cards: hydrated, hasMore, cursorAdvance: slice.length };
    },
    [],
  );

  /**
   * Fetch a page, then hop past consecutive empty pages.
   *
   * In semantic mode, `quickFilter === "new" | "updated"` is applied
   * client-side after the backend slice. That can produce `cards.length === 0`
   * while `hasMore` is still true and the cursor still moves forward — which
   * would cause the virtualized end-reached callback to never re-enter its
   * threshold band, stalling pagination on a transiently empty result set
   * even when later pages contain matches.
   *
   * To keep scroll-driven loading flowing, we hop past those empties (up to
   * `MAX_EMPTY_PAGE_HOPS`) here. The aggregated `cursorAdvance` reflects every
   * raw row consumed so the caller's `offsetRef` lands on the correct next
   * page. The standard / following paths filter server-side, so they return
   * a non-empty page on the first try unless the dataset truly is exhausted —
   * no extra hops in that case.
   */
  const fetchPageWithEmptyHop = useCallback(
    async (
      activeFilters: CardLoaderFilters,
      followed: Set<string>,
      offset: number,
    ): Promise<FetchPageResult> => {
      let page = await fetchPage(activeFilters, followed, offset);
      let totalAdvance = page.cursorAdvance;
      let hops = 0;
      while (
        page.cards.length === 0 &&
        page.hasMore &&
        hops < MAX_EMPTY_PAGE_HOPS
      ) {
        hops += 1;
        const next = await fetchPage(
          activeFilters,
          followed,
          offset + totalAdvance,
        );
        totalAdvance += next.cursorAdvance;
        page = next;
      }
      return {
        cards: page.cards,
        hasMore: page.hasMore,
        cursorAdvance: totalAdvance,
      };
    },
    [fetchPage],
  );

  // Initial-page load whenever filters change. Resets the cursor, snapshots
  // the active filters for `loadMore()` to reuse, and uses a token to discard
  // stale responses from prior filter sets.
  useEffect(() => {
    const token = ++inflightTokenRef.current;
    setLoading(true);
    setError(null);
    // Clear the load-more flag too. A stale in-flight `loadMore()` from the
    // previous filter snapshot skips its own `setIsFetchingMore(false)` once
    // the token changes, so without this reset the flag could stay stuck
    // true and silently block all future pagination on the new filter set.
    // The sync ref mirrors the state value so the re-entry gate inside
    // `loadMore` also unsticks immediately.
    setIsFetchingMore(false);
    isFetchingMoreRef.current = false;

    const snapshot = filters;
    const followedSnapshot = new Set(followedCardIds);
    activeFiltersRef.current = snapshot;
    activeFollowedRef.current = followedSnapshot;
    offsetRef.current = 0;

    (async () => {
      try {
        const page = await fetchPageWithEmptyHop(snapshot, followedSnapshot, 0);
        if (token !== inflightTokenRef.current) return;
        setCards(page.cards);
        setHasMore(page.hasMore);
        offsetRef.current = page.cursorAdvance;

        // Record search history once per initial load (same triggers as
        // before): user-typed semantic/text searches + non-quick-filter
        // standard loads.
        const isSemanticPath =
          snapshot.useSemanticSearch && snapshot.searchTerm.trim();
        const isStandardWithoutQuickFilter =
          !isSemanticPath &&
          snapshot.quickFilter !== "following" &&
          !snapshot.quickFilter;
        if (isSemanticPath || isStandardWithoutQuickFilter) {
          recordSearch(currentQueryConfig, page.cards.length);
        }
      } catch (err) {
        if (token !== inflightTokenRef.current) return;
        setError(classifyError(err));
      } finally {
        if (token === inflightTokenRef.current) setLoading(false);
      }
    })();
    // `currentQueryConfig` is rebuilt from the same filter inputs the rest of
    // this effect already depends on; including it would just cause an extra
    // re-fetch on every render. `recordSearch` from useSearchHistory is a
    // ref-backed stable callback. `fetchPage` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, followedCardIds, reloadKey]);

  const loadMore = useCallback(async () => {
    // The sync ref gate is the actual guard against re-entry. `isFetchingMore`
    // state lags by a render commit, so two `onEndReached` fires in the same
    // tick would both pass the state check and double-advance `offsetRef`
    // (skipping a page). The ref is mutated before any `await` so the second
    // call's gate sees the in-flight flag.
    if (loading || isFetchingMoreRef.current || !hasMore) return;
    const snapshot = activeFiltersRef.current;
    const followedSnapshot = activeFollowedRef.current;
    if (!snapshot) return;
    const token = inflightTokenRef.current;
    isFetchingMoreRef.current = true;
    setIsFetchingMore(true);
    try {
      const page = await fetchPageWithEmptyHop(
        snapshot,
        followedSnapshot,
        offsetRef.current,
      );
      if (token !== inflightTokenRef.current) return; // superseded by a new filter set
      setCards((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const incoming = page.cards.filter((c) => !seen.has(c.id));
        return [...prev, ...incoming];
      });
      offsetRef.current += page.cursorAdvance;
      setHasMore(page.hasMore);
    } catch (err) {
      if (token !== inflightTokenRef.current) return;
      setError(classifyError(err));
    } finally {
      if (token === inflightTokenRef.current) {
        isFetchingMoreRef.current = false;
        setIsFetchingMore(false);
      }
    }
    // `isFetchingMore` state intentionally excluded — the ref above is the
    // re-entry gate, and depending on the state would recreate the callback
    // on every fetch start/finish, churning the IntersectionObserver effect
    // in `VirtualizedGrid` that depends on `loadMore`'s identity.
  }, [loading, hasMore, fetchPageWithEmptyHop]);

  return {
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
  };
}
