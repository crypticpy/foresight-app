/**
 * Five-card KPI strip: Total Signals, New This Week, Pending Review, High
 * Confidence, Updated This Week. Tile values count up on mount via
 * useCountUp. Sparklines come from the lens overview where available; tiles
 * without backend trend data fall back to a flat 7-point series so the
 * sparkline component still renders cleanly.
 *
 * @module pages/Dashboard/KpiTiles
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Eye, Inbox, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { Sparkline } from "../../components/dashboard/Sparkline";
import { sparklineTotal } from "../../lib/dashboard-utils";
import type { SparklineByMetric } from "../../lib/dashboard-utils";
import type {
  DashboardStats,
  QualityDistribution,
} from "../../hooks/useDashboardData";
import { useCountUp } from "./useCountUp";

interface KpiTilesProps {
  stats: DashboardStats;
  qualityDistribution: QualityDistribution;
  pendingReviewCount: number;
  sparklineByMetric: SparklineByMetric;
}

export function KpiTiles({
  stats,
  qualityDistribution,
  pendingReviewCount,
  sparklineByMetric,
}: KpiTilesProps) {
  const animatedTotalCards = useCountUp(stats.totalCards);
  const animatedNewThisWeek = useCountUp(stats.newThisWeek);
  const animatedPendingReview = useCountUp(pendingReviewCount);
  const animatedHighConfidence = useCountUp(qualityDistribution.high);
  const animatedUpdatedThisWeek = useCountUp(stats.updatedThisWeek);

  // Flat 7-point zero series — fallback for KPIs whose trend isn't computed
  // by the backend. The Sparkline component draws a flat mid-line when the
  // value span is zero, signalling "no trend data yet" cleanly.
  const flatSpark = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return { date: d.toISOString().slice(0, 10), value: 0 };
    });
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      <Link
        to="/discover"
        aria-label={`Total Signals: ${stats.totalCards}`}
        className="bg-white dark:bg-dark-surface rounded-xl shadow-sm hover:shadow-md px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer group flex items-center gap-3"
      >
        <Eye className="h-5 w-5 flex-shrink-0 text-brand-blue group-hover:scale-110 transition-transform" />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Total Signals
          </span>
          <span className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums leading-tight">
            {animatedTotalCards}
          </span>
        </div>
        <div className="ml-auto h-8 w-16 flex-shrink-0">
          <Sparkline data={sparklineByMetric.new_cards?.points ?? flatSpark} />
        </div>
      </Link>

      <Link
        to="/discover?filter=new"
        aria-label={`New This Week: ${stats.newThisWeek}`}
        title={
          sparklineByMetric.new_cards
            ? `${sparklineTotal(sparklineByMetric.new_cards) ?? 0} in last 14 days`
            : undefined
        }
        className="bg-white dark:bg-dark-surface rounded-xl shadow-sm hover:shadow-md px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer group flex items-center gap-3"
      >
        <TrendingUp className="h-5 w-5 flex-shrink-0 text-brand-green group-hover:scale-110 transition-transform" />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            New This Week
          </span>
          <span className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums leading-tight">
            {animatedNewThisWeek}
          </span>
        </div>
        {sparklineByMetric.new_cards ? (
          <div className="ml-auto h-8 w-16 flex-shrink-0">
            <Sparkline
              data={sparklineByMetric.new_cards.points}
              stroke="#009F4D"
            />
          </div>
        ) : null}
      </Link>

      <Link
        to="/discover/queue"
        aria-label={`Pending Review: ${pendingReviewCount}`}
        title="Cards awaiting triage"
        className="bg-white dark:bg-dark-surface rounded-xl shadow-sm hover:shadow-md px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer group flex items-center gap-3"
      >
        <Inbox className="h-5 w-5 flex-shrink-0 text-extended-purple group-hover:scale-110 transition-transform" />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Pending Review
          </span>
          <span className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums leading-tight">
            {animatedPendingReview}
          </span>
        </div>
        <div className="ml-auto h-8 w-16 flex-shrink-0">
          <Sparkline data={flatSpark} stroke="#A78BFA" />
        </div>
      </Link>

      <Link
        to="/discover?confidence=high"
        aria-label={`High Confidence: ${qualityDistribution.high}`}
        title="Cards scoring ≥ 75 on confidence"
        className="bg-white dark:bg-dark-surface rounded-xl shadow-sm hover:shadow-md px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer group flex items-center gap-3"
      >
        <ShieldCheck className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            High Confidence
          </span>
          <span className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums leading-tight">
            {animatedHighConfidence}
          </span>
        </div>
        <div className="ml-auto h-8 w-16 flex-shrink-0">
          <Sparkline
            data={sparklineByMetric.new_classifications?.points ?? flatSpark}
            stroke="#10B981"
          />
        </div>
      </Link>

      <Link
        to="/discover?filter=updated"
        aria-label={`Updated This Week: ${stats.updatedThisWeek}`}
        title={
          sparklineByMetric.updated_cards
            ? `${sparklineTotal(sparklineByMetric.updated_cards) ?? 0} in last 14 days`
            : undefined
        }
        className="bg-white dark:bg-dark-surface rounded-xl shadow-sm hover:shadow-md px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer group flex items-center gap-3"
      >
        <RefreshCw className="h-5 w-5 flex-shrink-0 text-amber-500 group-hover:scale-110 transition-transform" />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Updated This Week
          </span>
          <span className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums leading-tight">
            {animatedUpdatedThisWeek}
          </span>
        </div>
        {sparklineByMetric.updated_cards ? (
          <div className="ml-auto h-8 w-16 flex-shrink-0">
            <Sparkline
              data={sparklineByMetric.updated_cards.points}
              stroke="#F59E0B"
            />
          </div>
        ) : null}
      </Link>
    </div>
  );
}
