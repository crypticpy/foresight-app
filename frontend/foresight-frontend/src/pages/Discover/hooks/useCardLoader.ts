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

import { useCallback, useEffect, useState } from "react";
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
}

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
  error: string | null;
  setError: (value: string | null) => void;
  /** Imperative re-fetch (used by error-banner "Try again" button). */
  reload: () => void;
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
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  // Load cards whenever filters change. The composer is responsible for
  // debouncing rapidly-changing values before they reach `filters`.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

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
      } = filters;

      try {
        // -- Path 1: "following" filter -----------------------------------
        if (quickFilter === "following") {
          if (followedCardIds.size === 0) {
            if (!cancelled) {
              setCards([]);
              setLoading(false);
            }
            return;
          }

          let query = supabase
            .from("cards")
            .select("*")
            .eq("status", "active")
            .in("id", Array.from(followedCardIds));

          if (searchTerm) {
            query = query.or(
              `name.ilike.%${searchTerm}%,summary.ilike.%${searchTerm}%`,
            );
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

          const sortConfig = getSortConfig(sortOption);
          const { data } = await query.order(sortConfig.column, {
            ascending: sortConfig.ascending,
          });
          const hydrated = await hydrateCardCollab(data || []);
          if (!cancelled) {
            setCards(hydrated);
            setLoading(false);
          }
          return;
        }

        // -- Path 2: semantic search --------------------------------------
        if (useSemanticSearch && searchTerm.trim()) {
          const token = await getAuthToken();

          if (token) {
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
              },
              limit: 100,
            };

            const response = await advancedSearch(token, searchRequest);

            let mappedCards: Card[] = response.results.map((result) => ({
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

            // Apply quick filters client-side for semantic search results
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
                (c) =>
                  (c.updated_at ?? c.created_at) >= oneWeekAgo.toISOString(),
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
            if (!cancelled) {
              setCards(hydrated);
              recordSearch(currentQueryConfig, mappedCards.length);
              setLoading(false);
            }
            return;
          }
        }

        // -- Path 3: standard Supabase query ------------------------------
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
          query = query.or(
            `name.ilike.%${searchTerm}%,summary.ilike.%${searchTerm}%`,
          );
        }
        if (impactMin > 0) query = query.gte("impact_score", impactMin);
        if (relevanceMin > 0)
          query = query.gte("relevance_score", relevanceMin);
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

        const sortConfig = getSortConfig(sortOption);
        const { data } = await query.order(sortConfig.column, {
          ascending: sortConfig.ascending,
        });

        const hydrated = await hydrateCardCollab(data || []);
        if (cancelled) return;

        setCards(hydrated);
        if (!quickFilter) {
          recordSearch(currentQueryConfig, (data || []).length);
        }
      } catch (err) {
        if (cancelled) return;
        setError(classifyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `currentQueryConfig` is rebuilt from the same filter inputs the rest of
    // this effect already depends on; including it would just cause an extra
    // re-fetch on every render. `recordSearch` from useSearchHistory is a
    // ref-backed stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, followedCardIds, reloadKey]);

  return { cards, pillars, stages, loading, error, setError, reload };
}
