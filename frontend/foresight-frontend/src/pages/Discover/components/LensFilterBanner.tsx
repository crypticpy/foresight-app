/**
 * Banner shown when the user arrives from a Dashboard tile/anchor/goal click
 * with one of the lens URL params (`flag`, `confidence`, `issue_tag`, `goal`).
 * Shows a one-line description of the active filter + a Clear button.
 *
 * @module pages/Discover/components/LensFilterBanner
 */

import { Filter, X } from "lucide-react";

export interface LensFilterBannerProps {
  flagFilter: string;
  confidenceFilter: string;
  issueTagFilter: string;
  goalFilter: string;
  goalLabel: string;
  matchCount: number;
  onClear: () => void;
}

export function LensFilterBanner({
  flagFilter,
  confidenceFilter,
  issueTagFilter,
  goalFilter,
  goalLabel,
  matchCount,
  onClear,
}: LensFilterBannerProps) {
  const hasFilter =
    flagFilter || confidenceFilter || issueTagFilter || goalFilter;
  if (!hasFilter) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 dark:bg-brand-blue/10 px-3 py-2 text-sm">
      <Filter className="h-4 w-4 text-brand-blue dark:text-brand-light-blue flex-shrink-0" />
      <span className="text-gray-800 dark:text-gray-100">
        Filtered to{" "}
        <span className="font-semibold">
          {flagFilter === "budget" && "budget-relevant signals"}
          {flagFilter === "climate" && "climate-relevant signals"}
          {confidenceFilter === "high" &&
            !flagFilter &&
            "high-confidence signals"}
          {issueTagFilter &&
            `issue tag: ${issueTagFilter
              .split("_")
              .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
              .join(" ")}`}
          {goalFilter &&
            !issueTagFilter &&
            (goalLabel ? `CSP goal: ${goalLabel}` : "a CSP goal")}
        </span>{" "}
        — {matchCount} match{matchCount === 1 ? "" : "es"}
      </span>
      <button
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-blue dark:text-brand-light-blue hover:text-brand-dark-blue dark:hover:text-white"
      >
        <X className="h-3.5 w-3.5" /> Clear
      </button>
    </div>
  );
}
