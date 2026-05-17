/**
 * Row of quick-filter chips (All Signals / New This Week / Updated This Week /
 * My Signals shortcut) plus the Quality Tier segmented control on the right.
 *
 * @module pages/Discover/components/QuickFilterChips
 */

import { Clock, Eye, RefreshCw, ShieldCheck, Star } from "lucide-react";
import { Link } from "react-router-dom";
import type { QualityFilter } from "../hooks/useCardLoader";

const QUALITY_TIERS: ReadonlyArray<{ value: QualityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "moderate", label: "Moderate" },
  { value: "low", label: "Needs Verification" },
] as const;

function qualityTierActiveClass(value: string): string {
  switch (value) {
    case "high":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "moderate":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "low":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm";
  }
}

export interface QuickFilterChipsProps {
  quickFilter: string;
  qualityFilter: QualityFilter;
  onSetQuickFilter: (value: string) => void;
  onSetQualityFilter: (value: QualityFilter) => void;
}

export function QuickFilterChips({
  quickFilter,
  qualityFilter,
  onSetQuickFilter,
  onSetQualityFilter,
}: QuickFilterChipsProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
        Quick filters:
      </span>
      <button
        onClick={() => onSetQuickFilter("")}
        className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          !quickFilter
            ? "bg-brand-blue text-white"
            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        }`}
      >
        <Eye className="h-4 w-4 mr-1.5" />
        All Signals
      </button>
      <button
        onClick={() => onSetQuickFilter("new")}
        className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          quickFilter === "new"
            ? "bg-brand-green text-white"
            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        }`}
      >
        <Clock className="h-4 w-4 mr-1.5" />
        New This Week
      </button>
      <button
        onClick={() => onSetQuickFilter("updated")}
        className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          quickFilter === "updated"
            ? "bg-amber-500 text-white"
            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        }`}
      >
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Updated This Week
      </button>
      <Link
        to="/signals"
        className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-extended-purple/10 hover:text-extended-purple dark:hover:text-extended-purple"
      >
        <Star className="h-4 w-4 mr-1.5" />
        My Signals &rarr;
      </Link>

      <div className="ml-auto flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
          <ShieldCheck className="h-3.5 w-3.5 inline mr-1" />
          Quality:
        </span>
        {QUALITY_TIERS.map((tier) => (
          <button
            key={tier.value}
            onClick={() => onSetQualityFilter(tier.value)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              qualityFilter === tier.value
                ? qualityTierActiveClass(tier.value)
                : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            {tier.label}
          </button>
        ))}
      </div>
    </div>
  );
}
