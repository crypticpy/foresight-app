/**
 * Visual inline bar for SQI score examples. Fill colour shifts with the
 * standard tier thresholds (green ≥70 / orange ≥40 / red).
 *
 * @module pages/Methodology/SqiBar
 */

import React from "react";
import { cn } from "../../lib/utils";

interface SqiBarProps {
  score: number;
  label: string;
}

export const SqiBar: React.FC<SqiBarProps> = ({ score, label }) => {
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
};
