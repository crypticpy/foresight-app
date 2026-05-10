/**
 * Horizontal bar chart of signals grouped by maturity stage. Bar colours
 * cycle through a fixed 8-tone palette so adjacent stages remain visually
 * distinct without per-stage configuration.
 *
 * @module pages/AnalyticsV2/StageDistributionChart
 */

import { Target } from "lucide-react";
import type { StageDistribution } from "./types";

const STAGE_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#6366F1",
  "#EF4444",
];

export function StageDistributionChart({
  data,
}: {
  data: StageDistribution[];
}) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-extended-purple" />
        Signals by Maturity Stage
      </h3>
      <div className="space-y-2">
        {data.map((stage, idx) => (
          <div key={stage.stage_id} className="flex items-center gap-3">
            <div
              className="w-20 text-xs text-gray-500 dark:text-gray-400 truncate"
              title={stage.stage_name}
            >
              {stage.stage_name}
            </div>
            <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{
                  width: `${(stage.count / maxCount) * 100}%`,
                  backgroundColor: STAGE_COLORS[idx % STAGE_COLORS.length],
                }}
              />
            </div>
            <div className="w-16 text-xs text-right text-gray-500 dark:text-gray-400">
              {stage.count} ({stage.percentage}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
