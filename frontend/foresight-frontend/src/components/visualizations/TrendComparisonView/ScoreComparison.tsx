/**
 * Score-by-score table comparing card 1 to card 2: pulls the latest
 * value of each multi-factor score for both cards and renders a
 * coloured delta pill (green up, red down, grey equal).
 *
 * @module components/visualizations/TrendComparisonView/ScoreComparison
 */

import { ArrowLeftRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { ScoreDifference } from "./types";

export interface ScoreComparisonProps {
  differences: ScoreDifference[];
  card1Name: string;
  card2Name: string;
}

export function ScoreComparison({
  differences,
  card1Name,
  card2Name,
}: ScoreComparisonProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <ArrowLeftRight className="h-5 w-5 text-brand-blue" />
        Score Comparison
      </h3>

      <div className="grid grid-cols-4 gap-4 mb-3 text-xs font-medium text-gray-500 dark:text-gray-400">
        <div>Metric</div>
        <div className="text-center truncate" title={card1Name}>
          {card1Name}
        </div>
        <div className="text-center truncate" title={card2Name}>
          {card2Name}
        </div>
        <div className="text-center">Difference</div>
      </div>

      <div className="space-y-2">
        {differences.map((diff) => {
          const isPositive = diff.difference !== null && diff.difference > 0;
          const isNegative = diff.difference !== null && diff.difference < 0;
          const isEqual = diff.difference === 0;

          return (
            <div
              key={diff.scoreType}
              className="grid grid-cols-4 gap-4 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {diff.name}
              </div>
              <div className="text-center">
                <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                  {diff.card1Value !== null ? diff.card1Value : "-"}
                </span>
              </div>
              <div className="text-center">
                <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                  {diff.card2Value !== null ? diff.card2Value : "-"}
                </span>
              </div>
              <div className="text-center">
                {diff.difference !== null ? (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center gap-1 min-w-[60px] px-2 py-0.5 rounded text-sm font-medium",
                      isPositive &&
                        "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
                      isNegative &&
                        "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
                      isEqual &&
                        "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
                    )}
                  >
                    {isPositive && <TrendingUp className="h-3 w-3" />}
                    {isNegative && <TrendingDown className="h-3 w-3" />}
                    {isEqual && <Minus className="h-3 w-3" />}
                    {isPositive && "+"}
                    {diff.difference}
                  </span>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
