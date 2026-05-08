/**
 * useDashboardData — owns the Dashboard v2 page's network state.
 *
 * Encapsulates the three independent loads (cards/stats RPC, pending-review
 * count, lens overview) plus the loading/refreshing flags so the page
 * component stays focused on layout. `refresh()` re-fires all three and
 * returns `{ ok }` so the caller can wire a toast on partial failure.
 *
 * The internal loaders are memoized with `useCallback` and depend only on
 * `userId`, which lets the mount-effect list them as deps without thrashing.
 * That removes the `react-hooks/exhaustive-deps` escape hatch the inline
 * version needed.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../App";
import { fetchPendingCount } from "../lib/discovery-api";
import { fetchLensOverview } from "../lib/dashboard-api";
import { logger } from "../lib/logger";
import type { BaseCard } from "../types/card";
import type { LensOverviewResponse } from "../types/dashboard";

export interface FollowingCard {
  id: string;
  priority: string;
  cards: BaseCard;
}

/**
 * Explicit type for rows returned by the Supabase join query
 * `card_follows.select("id, priority, cards (*)")`.
 *
 * `cards` may be `null` when the related card has been deleted or the
 * join yields no match, so consumers must guard before accessing fields.
 */
interface SupabaseFollowRow {
  id: string;
  priority: string;
  cards: BaseCard | null;
}

/** Shape of the get_dashboard_stats RPC response. */
interface DashboardStatsResponse {
  total_cards: number;
  new_this_week: number;
  following: number;
  workstreams: number;
}

export interface DashboardStats {
  totalCards: number;
  newThisWeek: number;
  following: number;
  workstreams: number;
  updatedThisWeek: number;
}

export interface QualityDistribution {
  high: number;
  moderate: number;
  low: number;
}

export interface UseDashboardDataResult {
  recentCards: BaseCard[];
  followingCards: FollowingCard[];
  stats: DashboardStats;
  qualityDistribution: QualityDistribution;
  pendingReviewCount: number;
  lensOverview: LensOverviewResponse | null;
  loading: boolean;
  refreshing: boolean;
  /** Re-fires all three loaders in parallel; `ok` is false if any rejected. */
  refresh: () => Promise<{ ok: boolean }>;
}

/** Extract a numeric count from a Supabase head-only response, defaulting to 0 on error. */
function safeCount(r: { error: unknown; count: number | null }): number {
  return r.error ? 0 : (r.count ?? 0);
}

const EMPTY_STATS: DashboardStats = {
  totalCards: 0,
  newThisWeek: 0,
  following: 0,
  workstreams: 0,
  updatedThisWeek: 0,
};

const EMPTY_QUALITY: QualityDistribution = {
  high: 0,
  moderate: 0,
  low: 0,
};

export function useDashboardData(
  userId: string | undefined,
): UseDashboardDataResult {
  const [recentCards, setRecentCards] = useState<BaseCard[]>([]);
  const [followingCards, setFollowingCards] = useState<FollowingCard[]>([]);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [qualityDistribution, setQualityDistribution] =
    useState<QualityDistribution>(EMPTY_QUALITY);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [lensOverview, setLensOverview] = useState<LensOverviewResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const [
        recentCardsResult,
        followingCardsResult,
        statsResult,
        updatedResult,
        qualityHighResult,
        qualityModResult,
        qualityLowResult,
      ] = await Promise.all([
        supabase
          .from("cards")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(6),

        supabase
          .from("card_follows")
          .select(`id, priority, cards (*)`)
          .eq("user_id", userId),

        supabase.rpc("get_dashboard_stats", { p_user_id: userId }),

        supabase
          .from("cards")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .gte("updated_at", oneWeekAgo.toISOString()),

        // Quality distribution buckets (high ≥75 / moderate 50-74 / low <50)
        supabase
          .from("cards")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .gte("signal_quality_score", 75),
        supabase
          .from("cards")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .gte("signal_quality_score", 50)
          .lt("signal_quality_score", 75),
        supabase
          .from("cards")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .or("signal_quality_score.lt.50,signal_quality_score.is.null"),
      ]);

      if (recentCardsResult.error) {
        console.error("Error loading recent cards:", recentCardsResult.error);
      }
      if (followingCardsResult.error) {
        console.error(
          "Error loading following cards:",
          followingCardsResult.error,
        );
      }
      if (statsResult.error) {
        console.error("Error loading dashboard stats:", statsResult.error);
      }

      setRecentCards(
        recentCardsResult.error ? [] : (recentCardsResult.data ?? []),
      );

      // Supabase infers `cards (*)` as `any[]`, but the actual runtime shape
      // is a single Card object (or null when the join has no match). Cast
      // through `unknown` to our explicit row type, then drop deleted cards.
      const rawFollowing: SupabaseFollowRow[] = followingCardsResult.error
        ? []
        : ((followingCardsResult.data ?? []) as unknown as SupabaseFollowRow[]);

      const transformedFollowing: FollowingCard[] = rawFollowing
        .filter(
          (row): row is SupabaseFollowRow & { cards: BaseCard } =>
            row.cards !== null,
        )
        .map((row) => ({
          id: row.id,
          priority: row.priority,
          cards: row.cards,
        }));
      setFollowingCards(transformedFollowing);

      const statsData: DashboardStatsResponse | null = statsResult.error
        ? null
        : statsResult.data;

      setStats({
        totalCards: statsData?.total_cards ?? 0,
        newThisWeek: statsData?.new_this_week ?? 0,
        following: statsData?.following ?? 0,
        workstreams: statsData?.workstreams ?? 0,
        updatedThisWeek: safeCount(updatedResult),
      });

      setQualityDistribution({
        high: safeCount(qualityHighResult),
        moderate: safeCount(qualityModResult),
        low: safeCount(qualityLowResult),
      });
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadPendingCount = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        const count = await fetchPendingCount(session.access_token);
        setPendingReviewCount(count);
      }
    } catch (err) {
      // Silently fail - non-critical
      logger.debug("Could not fetch pending count:", err);
    }
  }, []);

  const loadLensOverview = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const overview = await fetchLensOverview(session.access_token, 14);
      setLensOverview(overview);
    } catch (err) {
      // Lens overview is supplementary — render the dashboard regardless.
      logger.debug("Could not fetch lens overview:", err);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
    void loadPendingCount();
    void loadLensOverview();
  }, [loadDashboardData, loadPendingCount, loadLensOverview]);

  const refresh = useCallback(async (): Promise<{ ok: boolean }> => {
    if (refreshing) return { ok: true };
    setRefreshing(true);
    try {
      const results = await Promise.allSettled([
        loadDashboardData(),
        loadPendingCount(),
        loadLensOverview(),
      ]);
      const anyFailed = results.some((r) => r.status === "rejected");
      return { ok: !anyFailed };
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loadDashboardData, loadPendingCount, loadLensOverview]);

  return {
    recentCards,
    followingCards,
    stats,
    qualityDistribution,
    pendingReviewCount,
    lensOverview,
    loading,
    refreshing,
    refresh,
  };
}
