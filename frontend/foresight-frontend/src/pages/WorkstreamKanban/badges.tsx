/**
 * Small badge components used in the WorkstreamKanban header / filter
 * summary: active-status pill, keyword chip, and the stage-range collapser
 * that turns a list of consecutive stage ids into "Stages N - M".
 *
 * @module pages/WorkstreamKanban/badges
 */

import { Tag } from "lucide-react";
import { cn } from "../../lib/utils";
import { StageBadge } from "../../components/StageBadge";

export function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        isActive
          ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400"
          : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300",
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

function parseStageNumbers(stageIds: string[]): number[] {
  return stageIds
    .map((id) => parseInt(id, 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
}

function isConsecutiveRun(nums: number[]): boolean {
  return nums.every((n, i) => i === 0 || n === nums[i - 1]! + 1);
}

export function StageRangeDisplay({ stageIds }: { stageIds: string[] }) {
  if (stageIds.length === 0) return null;

  const stageNumbers = parseStageNumbers(stageIds);
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

  if (isConsecutiveRun(stageNumbers)) {
    return (
      <span className="text-sm text-gray-600 dark:text-gray-400">
        Stages {stageNumbers[0]} - {stageNumbers[stageNumbers.length - 1]}
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
