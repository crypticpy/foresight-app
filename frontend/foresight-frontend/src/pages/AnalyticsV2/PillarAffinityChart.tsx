/**
 * Side-by-side comparison of per-pillar follow distribution: the user's
 * percentage vs the community average, plus an affinity delta. Capped to
 * the top six pillars by user count.
 *
 * @module pages/AnalyticsV2/PillarAffinityChart
 */

import { Heart } from "lucide-react";
import { PillarBadge } from "../../components/PillarBadge";
import type { PillarAffinity } from "./types";

export function PillarAffinityChart({
  affinity,
}: {
  affinity: PillarAffinity[];
}) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Heart className="h-5 w-5 text-red-500" />
        Your Pillar Interests
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        How your follows compare to the community average
      </p>
      <div className="space-y-3">
        {affinity.slice(0, 6).map((p) => (
          <div key={p.pillar_code} className="flex items-center gap-3">
            <PillarBadge pillarId={p.pillar_code} size="sm" />
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-300">
                  You: {p.user_percentage}%
                </span>
                <span className="text-gray-400">
                  Community: {p.community_percentage}%
                </span>
              </div>
              <div className="flex h-2 gap-1">
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-blue rounded-full"
                    style={{ width: `${p.user_percentage}%` }}
                  />
                </div>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-400 rounded-full"
                    style={{ width: `${p.community_percentage}%` }}
                  />
                </div>
              </div>
            </div>
            <div
              className={`text-xs font-medium ${p.affinity_score > 0 ? "text-emerald-500" : p.affinity_score < 0 ? "text-gray-400" : ""}`}
            >
              {p.affinity_score > 0 ? "+" : ""}
              {p.affinity_score}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
