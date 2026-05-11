/**
 * Side-by-side comparison of the current user's follow + workstream counts
 * against the community average, with percentile bars under each.
 *
 * @module pages/AnalyticsV2/EngagementComparison
 */

import { Users } from "lucide-react";
import type { UserEngagementComparison } from "./types";

export function EngagementComparison({
  engagement,
}: {
  engagement: UserEngagementComparison;
}) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-brand-blue" />
        Your Engagement vs Community
      </h3>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-center mb-2">
            <div className="text-3xl font-bold text-brand-blue">
              {engagement.user_follow_count}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Signals Following
            </div>
          </div>
          <div className="text-center text-xs text-gray-400">
            Avg: {engagement.avg_community_follows.toFixed(1)} | Top{" "}
            {(100 - engagement.user_percentile_follows).toFixed(0)}%
          </div>
          <div className="mt-2 h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
            <div
              className="h-full bg-brand-blue rounded-full"
              style={{
                width: `${Math.min(engagement.user_percentile_follows, 100)}%`,
              }}
            />
          </div>
        </div>
        <div>
          <div className="text-center mb-2">
            <div className="text-3xl font-bold text-extended-purple">
              {engagement.user_workstream_count}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Workstreams
            </div>
          </div>
          <div className="text-center text-xs text-gray-400">
            Avg: {engagement.avg_community_workstreams.toFixed(1)} | Top{" "}
            {(100 - engagement.user_percentile_workstreams).toFixed(0)}%
          </div>
          <div className="mt-2 h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
            <div
              className="h-full bg-extended-purple rounded-full"
              style={{
                width: `${Math.min(engagement.user_percentile_workstreams, 100)}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
