/**
 * Composer for the Dashboard page. Pulls all data through useDashboardData
 * and threads the relevant slices into the sub-sections. The composer owns
 * the command palette state plus the refresh / toast handler — everything
 * else lives in the section components.
 *
 * @module pages/Dashboard
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../../hooks/useAuthContext";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useToast } from "../../components/ui/Toast";
import { CommandPalette } from "../../components/CommandPalette";
import { useCommandPaletteShortcut } from "../../hooks/useCommandPaletteShortcut";
import { buildDashboardCommandActions } from "../../lib/dashboard-commands";
import { buildSparklineByMetric } from "../../lib/dashboard-utils";
import { WhatChangedStrip } from "../../components/dashboard/WhatChangedStrip";
import { AskForesightBar } from "../../components/Chat/AskForesightBar";
import { PatternInsightsSection } from "../../components/PatternInsightsSection";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { DashboardHeader } from "./DashboardHeader";
import { KpiTiles } from "./KpiTiles";
import { QualityStrip } from "./QualityStrip";
import { StrategicLens } from "./StrategicLens";
import { FollowingSignals } from "./FollowingSignals";
import { RecentIntelligence } from "./RecentIntelligence";

export default function Dashboard() {
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

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <DashboardHeader
        email={user?.email}
        onOpenPalette={openPalette}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        actions={paletteActions}
      />

      <WhatChangedStrip
        delta={lensOverview?.delta_24h ?? null}
        className="mb-6"
      />
      <AskForesightBar className="mb-8" />

      <KpiTiles
        stats={stats}
        qualityDistribution={qualityDistribution}
        pendingReviewCount={pendingReviewCount}
        sparklineByMetric={sparklineByMetric}
      />
      <QualityStrip qualityDistribution={qualityDistribution} />
      <StrategicLens lensOverview={lensOverview} />

      <PatternInsightsSection className="mb-8" />

      <FollowingSignals followingCards={followingCards} />
      <RecentIntelligence recentCards={recentCards} />
    </div>
  );
}
