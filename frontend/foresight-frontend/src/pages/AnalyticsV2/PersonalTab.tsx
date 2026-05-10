/**
 * Personal-insights tab: engagement comparison, personal stat tiles, pillar
 * affinity, the user's followed-signals shortlist, and two
 * "popular-cards-you-don't-follow" panels.
 *
 * @module pages/AnalyticsV2/PersonalTab
 */

import { Link } from "react-router-dom";
import {
  Eye,
  FolderOpen,
  Heart,
  Layers,
  TrendingUp,
  Users,
} from "lucide-react";
import { PillarBadge } from "../../components/PillarBadge";
import { EmptyState, StatCard } from "./common";
import { EngagementComparison } from "./EngagementComparison";
import { PillarAffinityChart } from "./PillarAffinityChart";
import { PopularCardsSection } from "./PopularCardsSection";
import type { PersonalStats } from "./types";

export function PersonalTab({ stats }: { stats: PersonalStats }) {
  return (
    <div className="space-y-6">
      <EngagementComparison engagement={stats.engagement} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Following"
          value={stats.total_following}
          icon={<Heart className="h-6 w-6" />}
          linkTo="/discover?filter=following"
          colorClass="text-red-500"
        />
        <StatCard
          title="Workstreams"
          value={stats.workstream_count}
          icon={<FolderOpen className="h-6 w-6" />}
          linkTo="/workstreams"
          colorClass="text-brand-blue"
        />
        <StatCard
          title="Signals in Workstreams"
          value={stats.cards_in_workstreams}
          icon={<Layers className="h-6 w-6" />}
          colorClass="text-extended-purple"
        />
        <StatCard
          title="Engagement Rank"
          value={`Top ${(100 - stats.engagement.user_percentile_follows).toFixed(0)}%`}
          icon={<TrendingUp className="h-6 w-6" />}
          colorClass="text-emerald-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PillarAffinityChart affinity={stats.pillar_affinity} />

        <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-brand-blue" />
            Your Followed Signals
          </h3>
          {stats.following.length === 0 ? (
            <EmptyState
              title="Not following any signals yet"
              description="Browse the Discover page to find and follow signals that interest you."
              icon={<Eye className="h-6 w-6 text-gray-400" />}
            />
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {stats.following.slice(0, 10).map((item) => (
                <Link
                  key={item.card_id}
                  to={`/signals/${item.card_slug || item.card_id}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-surface-deep transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {item.card_name}
                    </span>
                    {item.pillar_id && (
                      <PillarBadge pillarId={item.pillar_id} size="sm" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Users className="h-3 w-3" />
                    {item.follower_count}
                  </div>
                </Link>
              ))}
              {stats.following.length > 10 && (
                <Link
                  to="/discover?filter=following"
                  className="block text-center text-sm text-brand-blue hover:underline py-2"
                >
                  View all {stats.following.length} signals
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PopularCardsSection
          cards={stats.popular_not_followed}
          title="Popular Signals You're Missing"
          subtitle="Signals others are following that you haven't discovered yet"
          emptyMessage="You're already following the most popular signals!"
        />
        <PopularCardsSection
          cards={stats.recently_popular}
          title="Trending This Week"
          subtitle="Signals gaining followers recently"
          emptyMessage="No new trending signals this week."
        />
      </div>
    </div>
  );
}
