/**
 * Horizontal bar chart of signals grouped by strategic pillar. Each row
 * carries a pillar badge, count, percentage, and a brand-blue progress bar
 * scaled to the max count in the dataset.
 *
 * @module pages/AnalyticsV2/PillarDistribution
 */

import { Layers } from "lucide-react";
import { PillarBadge } from "../../components/PillarBadge";
import type { PillarCoverageItem } from "./types";

export function PillarDistribution({ data }: { data: PillarCoverageItem[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Layers className="h-5 w-5 text-brand-blue" />
        Signals by Pillar
      </h3>
      <div className="space-y-3">
        {data.map((pillar) => (
          <div key={pillar.pillar_code} className="group">
            <div className="flex items-center justify-between text-sm mb-1">
              <div className="flex items-center gap-2">
                <PillarBadge pillarId={pillar.pillar_code} size="sm" />
                <span className="text-gray-600 dark:text-gray-300 hidden sm:inline">
                  {pillar.pillar_name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                <span>{pillar.count} signals</span>
                <span className="text-xs">({pillar.percentage}%)</span>
              </div>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-blue rounded-full transition-all duration-500"
                style={{ width: `${(pillar.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
