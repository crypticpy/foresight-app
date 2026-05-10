/**
 * Signal Quality Index visual bar — score on a 0-100 scale with a color
 * chosen by tier (green / orange / red).
 *
 * @module pages/GuideSignals/SqiBar
 */

import { cn } from "../../lib/utils";

export function SqiBar({ score, label }: { score: number; label: string }) {
  const color =
    score >= 70
      ? "bg-brand-green"
      : score >= 40
        ? "bg-extended-orange"
        : "bg-extended-red";

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-right font-semibold tabular-nums text-gray-700 dark:text-gray-300">
        {score}/100
      </span>
      <div className="flex-1 h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-200",
            color,
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-gray-500 dark:text-gray-400 text-xs w-28">
        {label}
      </span>
    </div>
  );
}
