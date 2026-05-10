/**
 * Ranked list of trending topics with a per-row direction badge. Re-used for
 * both "Trending Pillars" and "High Velocity Signals" panels — the title
 * comes in as a prop.
 *
 * @module pages/AnalyticsV2/HotTopics
 */

import { Zap } from "lucide-react";
import { EmptyState, TrendBadge } from "./common";
import type { TrendingTopic } from "./types";

interface HotTopicsProps {
  topics: TrendingTopic[];
  title: string;
}

export function HotTopics({ topics, title }: HotTopicsProps) {
  if (topics.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-extended-orange" />
          {title}
        </h3>
        <EmptyState
          title="No trending topics"
          description="Trending topics will appear as more signals gain velocity."
          icon={<Zap className="h-6 w-6 text-gray-400" />}
        />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Zap className="h-5 w-5 text-extended-orange" />
        {title}
      </h3>
      <div className="space-y-3">
        {topics.map((topic, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-surface rounded-lg"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-brand-blue to-brand-green rounded-full">
                {idx + 1}
              </span>
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">
                  {topic.name}
                </div>
                {topic.velocity_avg && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Velocity: {topic.velocity_avg}
                  </div>
                )}
              </div>
            </div>
            <TrendBadge trend={topic.trend} />
          </div>
        ))}
      </div>
    </div>
  );
}
