/**
 * System-wide overview tab: two rows of stat tiles, pillar + stage
 * distributions, trending + hot-topic panels, the most-followed signals
 * grid, and the top-domains leaderboard.
 *
 * @module pages/AnalyticsV2/SystemTab
 */

import { Link } from "react-router-dom";
import {
  Database,
  Eye,
  FolderOpen,
  Heart,
  Layers,
  Search,
  Star,
  Users,
} from "lucide-react";
import TopDomainsLeaderboard from "../../components/analytics/TopDomainsLeaderboard";
import { StatCard } from "./common";
import { HotTopics } from "./HotTopics";
import { PillarDistribution } from "./PillarDistribution";
import { StageDistributionChart } from "./StageDistributionChart";
import type { SystemWideStats } from "./types";

export function SystemTab({ stats }: { stats: SystemWideStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Signals"
          value={stats.active_cards}
          subtitle={`${stats.cards_this_week} new this week`}
          icon={<Eye className="h-6 w-6" />}
          linkTo="/discover"
          colorClass="text-brand-blue"
        />
        <StatCard
          title="Sources"
          value={stats.source_stats.total_sources}
          subtitle={`${stats.source_stats.sources_this_week} this week`}
          icon={<Database className="h-6 w-6" />}
          colorClass="text-extended-purple"
        />
        <StatCard
          title="Discovery Runs"
          value={stats.discovery_stats.total_discovery_runs}
          subtitle={`${stats.discovery_stats.cards_discovered} signals discovered`}
          icon={<Search className="h-6 w-6" />}
          colorClass="text-emerald-500"
        />
        <StatCard
          title="Community Engagement"
          value={stats.follow_stats.total_follows}
          subtitle={`${stats.follow_stats.unique_users_following} active users`}
          icon={<Users className="h-6 w-6" />}
          colorClass="text-extended-orange"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Workstreams"
          value={stats.workstream_engagement.total_workstreams}
          subtitle={`${stats.workstream_engagement.active_workstreams} active`}
          icon={<FolderOpen className="h-6 w-6" />}
          linkTo="/workstreams"
          colorClass="text-brand-blue"
        />
        <StatCard
          title="Signals in Workstreams"
          value={stats.workstream_engagement.unique_cards_in_workstreams}
          subtitle={`Avg: ${stats.workstream_engagement.avg_cards_per_workstream}/workstream`}
          icon={<Layers className="h-6 w-6" />}
          colorClass="text-extended-purple"
        />
        <StatCard
          title="Signals Followed"
          value={stats.follow_stats.unique_cards_followed}
          subtitle="Unique signals being tracked"
          icon={<Heart className="h-6 w-6" />}
          colorClass="text-red-500"
        />
        <StatCard
          title="Searches"
          value={stats.discovery_stats.total_searches}
          subtitle={`${stats.discovery_stats.searches_this_week} this week`}
          icon={<Search className="h-6 w-6" />}
          colorClass="text-amber-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PillarDistribution data={stats.cards_by_pillar} />
        <StageDistributionChart data={stats.cards_by_stage} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HotTopics topics={stats.trending_pillars} title="Trending Pillars" />
        <HotTopics topics={stats.hot_topics} title="High Velocity Signals" />
      </div>

      {stats.follow_stats.most_followed_cards.length > 0 && (
        <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            Most Followed Signals
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.follow_stats.most_followed_cards.map((card, idx) => (
              <Link
                key={card.card_id}
                to={`/signals/${card.card_slug || card.card_id}`}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-surface rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface-elevated transition-colors"
              >
                <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-white bg-amber-500 rounded-full">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {card.card_name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {card.follower_count} followers
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <TopDomainsLeaderboard />
    </div>
  );
}
