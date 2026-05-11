/**
 * Small presentational helpers used in the WorkstreamFeed header and filter
 * display: an active/inactive status pill, a keyword pill, and a stage-range
 * renderer that collapses consecutive stages into a "Stages N - M" label.
 *
 * @module pages/WorkstreamFeed/badges
 */

import { Tag } from "lucide-react";
import { StageBadge } from "../../components/StageBadge";
import { cn } from "../../lib/utils";

export function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        isActive
          ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border border-green-300 dark:border-green-700"
          : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600",
      )}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export function KeywordTag({ keyword }: { keyword: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-light-blue dark:bg-brand-blue/20 text-brand-dark-blue dark:text-brand-light-blue border border-brand-blue/30 dark:border-brand-blue/40">
      <Tag className="h-3 w-3" />
      {keyword}
    </span>
  );
}

export function StageRangeDisplay({ stageIds }: { stageIds: string[] }) {
  if (stageIds.length === 0) return null;

  const stageNumbers = stageIds
    .map((id) => parseInt(id, 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  if (stageNumbers.length === 0) return null;

  if (stageNumbers.length <= 2) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {stageNumbers.map((stage) => (
          <StageBadge
            key={stage}
            stage={stage}
            size="sm"
            showName={false}
            variant="minimal"
          />
        ))}
      </div>
    );
  }

  const isConsecutive = stageNumbers.every(
    (n, i) => i === 0 || n === stageNumbers[i - 1]! + 1,
  );

  if (isConsecutive) {
    const min = stageNumbers[0]!;
    const max = stageNumbers[stageNumbers.length - 1]!;
    return (
      <span className="text-sm text-gray-600 dark:text-gray-400">
        Stages {min} - {max}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stageNumbers.map((stage) => (
        <StageBadge
          key={stage}
          stage={stage}
          size="sm"
          showName={false}
          variant="minimal"
        />
      ))}
    </div>
  );
}
