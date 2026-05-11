/**
 * Shared response types for the Analytics dashboard. These mirror what the
 * /api/v1/analytics/system-stats and /personal-stats endpoints return.
 *
 * @module pages/AnalyticsV2/types
 */

export interface PillarCoverageItem {
  pillar_code: string;
  pillar_name: string;
  count: number;
  percentage: number;
  avg_velocity: number | null;
  trend_direction?: "up" | "down" | "stable";
}

export interface StageDistribution {
  stage_id: string;
  stage_name: string;
  count: number;
  percentage: number;
}

export interface HorizonDistribution {
  horizon: string;
  label: string;
  count: number;
  percentage: number;
}

export interface TrendingTopic {
  name: string;
  count: number;
  trend: string;
  velocity_avg: number | null;
}

export interface SourceStats {
  total_sources: number;
  sources_this_week: number;
  sources_by_type: Record<string, number>;
}

export interface DiscoveryStats {
  total_discovery_runs: number;
  runs_this_week: number;
  total_searches: number;
  searches_this_week: number;
  cards_discovered: number;
  avg_cards_per_run: number;
}

export interface WorkstreamEngagement {
  total_workstreams: number;
  active_workstreams: number;
  unique_cards_in_workstreams: number;
  avg_cards_per_workstream: number;
}

export interface FollowStats {
  total_follows: number;
  unique_cards_followed: number;
  unique_users_following: number;
  most_followed_cards: Array<{
    card_id: string;
    card_slug?: string;
    card_name: string;
    follower_count: number;
  }>;
}

export interface SystemWideStats {
  total_cards: number;
  active_cards: number;
  cards_this_week: number;
  cards_this_month: number;
  cards_by_pillar: PillarCoverageItem[];
  cards_by_stage: StageDistribution[];
  cards_by_horizon: HorizonDistribution[];
  trending_pillars: TrendingTopic[];
  hot_topics: TrendingTopic[];
  source_stats: SourceStats;
  discovery_stats: DiscoveryStats;
  workstream_engagement: WorkstreamEngagement;
  follow_stats: FollowStats;
  generated_at: string;
}

export interface UserFollowItem {
  card_id: string;
  card_slug?: string;
  card_name: string;
  pillar_id: string | null;
  horizon: string | null;
  velocity_score: number | null;
  followed_at: string;
  priority: string;
  follower_count: number;
}

export interface PopularCard {
  card_id: string;
  card_slug?: string;
  card_name: string;
  summary: string;
  pillar_id: string | null;
  horizon: string | null;
  velocity_score: number | null;
  follower_count: number;
  is_followed_by_user: boolean;
}

export interface UserEngagementComparison {
  user_follow_count: number;
  avg_community_follows: number;
  user_workstream_count: number;
  avg_community_workstreams: number;
  user_percentile_follows: number;
  user_percentile_workstreams: number;
}

export interface PillarAffinity {
  pillar_code: string;
  pillar_name: string;
  user_count: number;
  user_percentage: number;
  community_percentage: number;
  affinity_score: number;
}

export interface PersonalStats {
  following: UserFollowItem[];
  total_following: number;
  engagement: UserEngagementComparison;
  pillar_affinity: PillarAffinity[];
  popular_not_followed: PopularCard[];
  recently_popular: PopularCard[];
  workstream_count: number;
  cards_in_workstreams: number;
  generated_at: string;
}
