import React, {
  useCallback,
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Eye,
  Plus,
  Star,
  ArrowRight,
  RefreshCw,
  BookOpen,
  Command,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import { useAuthContext } from "../hooks/useAuthContext";
import { PillarBadge } from "../components/PillarBadge";
import { HorizonBadge } from "../components/HorizonBadge";
import { StageBadge } from "../components/StageBadge";
import { Top25Badge } from "../components/Top25Badge";
import { QualityBadge } from "../components/QualityBadge";
import { VelocityBadge, type VelocityTrend } from "../components/VelocityBadge";
import { PatternInsightsSection } from "../components/PatternInsightsSection";
import { AskForesightBar } from "../components/Chat/AskForesightBar";
import { parseStageNumber } from "../lib/stage-utils";
import { buildSparklineByMetric, sparklineTotal } from "../lib/dashboard-utils";
import { buildDashboardCommandActions } from "../lib/dashboard-commands";
import { Sparkline } from "../components/dashboard/Sparkline";
import { Skeleton } from "../components/dashboard/Skeleton";
import { WhatChangedStrip } from "../components/dashboard/WhatChangedStrip";
import { AnchorRadar } from "../components/dashboard/AnchorRadar";
import { CspHeatmap } from "../components/dashboard/CspHeatmap";
import { SignalTypeDonut } from "../components/dashboard/SignalTypeDonut";
import { IssueTagCloud } from "../components/dashboard/IssueTagCloud";
import { FlagsRow } from "../components/dashboard/FlagsRow";
import { LensFlagChips } from "../components/lens/LensFlagChips";
import { useToast } from "../components/ui/Toast";
import { CommandPalette } from "../components/CommandPalette";
import { useCommandPaletteShortcut } from "../hooks/useCommandPaletteShortcut";
import { useDashboardData } from "../hooks/useDashboardData";

/**
 * Animates a number from 0 to the target value over the given duration (ms)
 * using requestAnimationFrame for smooth 60fps rendering.
 */
function useCountUp(target: number, duration = 500): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // Use ease-out curve for a more natural feel
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    medium:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  };
  return (
    colors[priority] ||
    "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
  );
};

const getPriorityBorder = (priority: string) => {
  const borders: Record<string, string> = {
    high: "border-l-red-500",
    medium: "border-l-amber-500",
    low: "border-l-emerald-500",
  };
  return borders[priority] || "border-l-gray-300";
};

const getPriorityGradient = (priority: string) => {
  const gradients: Record<string, string> = {
    high: "from-red-50 dark:from-red-900/10",
    medium: "from-amber-50 dark:from-amber-900/10",
    low: "from-emerald-50 dark:from-emerald-900/10",
  };
  return gradients[priority] || "from-gray-50 dark:from-gray-800/50";
};

const Dashboard: React.FC = () => {
  const { user } = useAuthContext();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const {
    recentCards,
    followingCards,
    stats,
    qualityDistribution,
    pendingReviewCount,
    lensOverview,
    loading,
    refreshing,
    refresh,
  } = useDashboardData(user?.id);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const sparklineByMetric = useMemo(
    () => buildSparklineByMetric(lensOverview?.sparklines),
    [lensOverview?.sparklines],
  );

  // Flat 7-point zero series — used as a fallback for KPI tiles whose trend
  // isn't computed by the backend (Total / Pending / High-Confidence). The
  // Sparkline component renders a flat mid-line when the value-span is zero,
  // which signals "no trend data yet" without making the tile look broken.
  const flatSpark = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return { date: d.toISOString().slice(0, 10), value: 0 };
    });
  }, []);

  // Animated stat card values
  const animatedTotalCards = useCountUp(stats.totalCards);
  const animatedNewThisWeek = useCountUp(stats.newThisWeek);
  const animatedPendingReview = useCountUp(pendingReviewCount);
  const animatedHighConfidence = useCountUp(qualityDistribution.high);
  const animatedUpdatedThisWeek = useCountUp(stats.updatedThisWeek);

  const handleRefresh = useCallback(async () => {
    const { ok } = await refresh();
    if (ok) {
      pushToast("Dashboard refreshed", { variant: "success" });
    } else {
      pushToast("Couldn't refresh — try again in a moment", {
        variant: "error",
      });
    }
  }, [refresh, pushToast]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  useCommandPaletteShortcut(openPalette);

  const paletteActions = useMemo(
    () => buildDashboardCommandActions(navigate, handleRefresh),
    [navigate, handleRefresh],
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div
            className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-9 w-72"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-5 w-96 mt-2"
            style={{ animationDelay: "50ms" }}
          />
        </div>

        {/* Ask Foresight Bar skeleton */}
        <div
          className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-xl h-12 mb-8"
          style={{ animationDelay: "100ms" }}
        />

        {/* Stat cards skeleton — 5 cards (heightened to fit sparkline rows) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className="rounded-xl h-32"
              style={{ animationDelay: `${150 + i * 50}ms` }}
            />
          ))}
        </div>

        {/* Quality distribution bar skeleton */}
        <div className="flex items-center justify-between mb-8">
          <div
            className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-5 w-64"
            style={{ animationDelay: "400ms" }}
          />
          <div
            className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-5 w-48"
            style={{ animationDelay: "450ms" }}
          />
        </div>

        {/* Pattern Insights skeleton */}
        <div className="mb-8">
          <div
            className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-6 w-48 mb-4"
            style={{ animationDelay: "500ms" }}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-xl h-48"
                style={{ animationDelay: `${550 + i * 50}ms` }}
              />
            ))}
          </div>
        </div>

        {/* Following Signals skeleton */}
        <div className="mb-8">
          <div
            className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-6 w-56 mb-4"
            style={{ animationDelay: "700ms" }}
          />
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-xl h-24"
                style={{ animationDelay: `${750 + i * 50}ms` }}
              />
            ))}
          </div>
        </div>

        {/* Recent Intelligence skeleton */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div
              className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-6 w-48"
              style={{ animationDelay: "900ms" }}
            />
            <div
              className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-lg h-9 w-24"
              style={{ animationDelay: "950ms" }}
            />
          </div>
          <div className="grid gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-xl h-32"
                style={{ animationDelay: `${1000 + i * 50}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark-blue dark:text-white">
            {(() => {
              const username = user?.email?.split("@")[0];
              if (!username) return "Welcome back";
              const friendly = username
                .split(/[._-]+/)
                .filter(Boolean)
                .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                .join(" ");
              return `Welcome back, ${friendly}`;
            })()}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Here's what's happening in your strategic intelligence feed.
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={openPalette}
            aria-label="Open command palette (⌘K)"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-surface-hover transition-colors"
          >
            <Command className="h-4 w-4" />
            <span className="hidden sm:inline">Commands</span>
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-surface-hover text-gray-500 dark:text-gray-400">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh dashboard"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-surface-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        actions={paletteActions}
      />

      {/* What changed in the last 24 hours (renders nothing while loading) */}
      <WhatChangedStrip
        delta={lensOverview?.delta_24h ?? null}
        className="mb-6"
      />

      {/* Ask Foresight Bar */}
      <AskForesightBar className="mb-8" />

      {/* Stats Cards - Clickable KPIs */}
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
            <Sparkline
              data={sparklineByMetric.new_cards?.points ?? flatSpark}
            />
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

      {/* Quality Distribution & Methodology Link */}
      <div className="flex items-center justify-between mb-8">
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            {qualityDistribution.high} High
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            {qualityDistribution.moderate} Moderate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            {qualityDistribution.low} Needs Verification
          </span>
        </div>
        <Link
          to="/methodology"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-blue dark:hover:text-brand-blue transition-colors"
        >
          <BookOpen className="h-4 w-4" />
          How does Foresight work?
        </Link>
      </div>

      {/* Strategic Lens — anchor / CSP / signal-type / issue-tag / flag aggregates */}
      {lensOverview ? (
        <>
          {/* Top row: chart cards */}
          <section
            className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-5"
            aria-label="Strategic lens charts"
          >
            {/* Anchor radar */}
            <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5 flex flex-col">
              <header className="mb-2">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Strategic Anchor Coverage
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Mean 0–100 score across {lensOverview.classified_card_count}{" "}
                  of {lensOverview.total_active_cards} active cards.
                </p>
              </header>
              <div className="flex-1 flex items-center justify-center">
                <AnchorRadar data={lensOverview.anchor_means} size={240} />
              </div>
            </div>

            {/* Signal-type donut */}
            <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5 flex flex-col">
              <header className="mb-2">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Signal Type Mix
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Trend, driver, signal, or unclassified — per the foresight
                  vocabulary.
                </p>
              </header>
              <div className="flex-1 flex items-center justify-center">
                <SignalTypeDonut
                  data={lensOverview.signal_type_counts}
                  size={200}
                />
              </div>
            </div>
          </section>

          {/* Bottom row: CSP coverage (2/3) + flags + tags stack (1/3) */}
          <section
            className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-5"
            aria-label="Strategic lens overview"
          >
            <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5 lg:col-span-2">
              <header className="mb-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  CSP Goal Coverage
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Active cards per CSP goal, grouped by pillar.
                </p>
              </header>
              <CspHeatmap
                data={lensOverview.csp_coverage}
                onGoalClick={(goal) =>
                  navigate(
                    `/discover?goal=${encodeURIComponent(
                      goal.goal_id,
                    )}&goal_label=${encodeURIComponent(
                      `${goal.code} — ${goal.name}`,
                    )}`,
                  )
                }
              />
            </div>

            <div className="flex flex-col gap-5">
              <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5">
                <header className="mb-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Operational Flags
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Highly relevant to budget or climate.
                  </p>
                </header>
                <FlagsRow
                  budgetFlagCount={lensOverview.budget_flag_count}
                  climateFlagCount={lensOverview.climate_flag_count}
                  totalActiveCards={lensOverview.total_active_cards}
                />
              </div>

              <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5">
                <header className="mb-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Top Issue Tags
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Most-tagged issues — size scales with count.
                  </p>
                </header>
                <IssueTagCloud data={lensOverview.top_issue_tags} />
              </div>
            </div>
          </section>
        </>
      ) : null}

      {/* AI-Detected Patterns */}
      <PatternInsightsSection className="mb-8" />

      {/* Following Cards */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Your Followed Signals
          </h2>
        </div>
        {followingCards.length > 0 ? (
          <div className="grid gap-4">
            {followingCards.slice(0, 3).map((following, index) => {
              const stageNum = parseStageNumber(following.cards.stage_id);
              return (
                <div
                  key={following.id}
                  style={{
                    animationDelay: `${Math.min(index, 5) * 50}ms`,
                    animationFillMode: "both",
                  }}
                  className={`animate-in fade-in slide-in-from-bottom-2 duration-300 bg-gradient-to-r ${getPriorityGradient(following.priority)} to-white dark:to-[#2d3166] rounded-xl shadow p-6 border-l-4 ${getPriorityBorder(following.priority)} transition-all duration-200 hover:-translate-y-1 hover:shadow-lg`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                          <Link
                            to={`/signals/${following.cards.slug}`}
                            state={{ from: "/" }}
                            className="hover:text-brand-blue transition-colors"
                          >
                            {following.cards.name}
                          </Link>
                        </h3>
                        <PillarBadge
                          pillarId={following.cards.pillar_id}
                          showIcon={true}
                          size="sm"
                        />
                        <HorizonBadge
                          horizon={following.cards.horizon}
                          size="sm"
                        />
                        {stageNum && (
                          <StageBadge
                            stage={stageNum}
                            size="sm"
                            showName={false}
                            variant="minimal"
                          />
                        )}
                        <VelocityBadge
                          trend={
                            following.cards.velocity_trend as VelocityTrend
                          }
                          score={following.cards.velocity_score}
                        />
                        {following.cards.top25_relevance &&
                          following.cards.top25_relevance.length > 0 && (
                            <Top25Badge
                              priorities={following.cards.top25_relevance}
                              size="sm"
                              showCount={true}
                            />
                          )}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(following.priority)}`}
                        >
                          {following.priority}
                        </span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-300 mb-3">
                        {following.cards.summary}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-brand-blue"></span>
                          Impact: {following.cards.impact_score}/100
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-extended-purple"></span>
                          Relevance: {following.cards.relevance_score}/100
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
            <Star className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              Start Following Signals
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Follow signals to build your personalized intelligence feed.
              <br />
              <span className="text-gray-400">
                Browse the Discover page and click the star icon on any signal
                to start following it.
              </span>
            </p>
            <div className="mt-6">
              <Link
                to="/discover"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-brand-dark-blue transition-colors"
              >
                <Eye className="h-4 w-4 mr-2" />
                Explore Signals
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Recent Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Recent Intelligence
          </h2>
          <Link
            to="/discover"
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-brand-blue bg-brand-light-blue hover:bg-brand-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
          >
            <Plus className="h-4 w-4 mr-1" />
            View All
          </Link>
        </div>
        <div className="grid gap-4">
          {recentCards.map((card, index) => {
            const stageNum = parseStageNumber(card.stage_id);
            return (
              <div
                key={card.id}
                style={{
                  animationDelay: `${Math.min(index, 5) * 50}ms`,
                  animationFillMode: "both",
                }}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 bg-white dark:bg-dark-surface rounded-xl shadow p-6 border-l-4 border-transparent transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-l-brand-blue"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        <Link
                          to={`/signals/${card.slug}`}
                          state={{ from: "/" }}
                          className="hover:text-brand-blue transition-colors"
                        >
                          {card.name}
                        </Link>
                      </h3>
                      <QualityBadge
                        score={card.signal_quality_score}
                        size="sm"
                      />
                      <PillarBadge
                        pillarId={card.pillar_id}
                        showIcon={true}
                        size="sm"
                      />
                      <HorizonBadge horizon={card.horizon} size="sm" />
                      {stageNum && (
                        <StageBadge
                          stage={stageNum}
                          size="sm"
                          showName={false}
                          variant="minimal"
                        />
                      )}
                      <VelocityBadge
                        trend={card.velocity_trend as VelocityTrend}
                        score={card.velocity_score}
                      />
                      {card.top25_relevance &&
                        card.top25_relevance.length > 0 && (
                          <Top25Badge
                            priorities={card.top25_relevance}
                            size="sm"
                            showCount={true}
                          />
                        )}
                      <LensFlagChips
                        budgetAssessment={card.budget_assessment ?? null}
                        climateAssessment={card.climate_assessment ?? null}
                        issueTags={card.issue_tags ?? null}
                      />
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 mb-3">
                      {card.summary}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span>Impact: {card.impact_score}/100</span>
                      <span>Relevance: {card.relevance_score}/100</span>
                      <span>Velocity: {card.velocity_score}/100</span>
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <Link
                      to={`/signals/${card.slug}`}
                      state={{ from: "/" }}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
