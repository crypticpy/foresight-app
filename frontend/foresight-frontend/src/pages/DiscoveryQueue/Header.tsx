/**
 * Top-of-page header for the Discovery Queue: title + intro copy, refresh
 * button, confidence-tier stat chips, and the optional review-progress bar.
 *
 * @module pages/DiscoveryQueue/Header
 */

import * as Progress from "@radix-ui/react-progress";
import {
  AlertTriangle,
  CheckCircle,
  Inbox,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";

export interface QueueStats {
  total: number;
  high: number;
  medium: number;
  low: number;
}

export interface ProgressStats {
  reviewed: number;
  total: number;
  /** 0–100 percentage of reviewed/total. */
  percentage: number;
}

export interface HeaderProps {
  loading: boolean;
  isMobile: boolean;
  onRefresh: () => void;
  stats: QueueStats;
  progress: ProgressStats;
}

export function Header({
  loading,
  isMobile,
  onRefresh,
  stats,
  progress,
}: HeaderProps) {
  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark-blue dark:text-white flex items-center gap-2 sm:gap-3">
            <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-brand-blue flex-shrink-0" />
            <span className="truncate">Discovery Queue</span>
          </h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Review AI-discovered signals before they're added to the
            intelligence library.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:opacity-50 transition-colors flex-shrink-0 active:scale-95"
        >
          <RefreshCw
            className={`h-5 w-5 sm:h-4 sm:w-4 ${loading ? "animate-spin" : ""} ${isMobile ? "" : "mr-2"}`}
          />
          {!isMobile && "Refresh"}
        </button>
      </div>

      <div className="mt-3 sm:mt-4 -mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-2 sm:gap-3 flex-nowrap sm:flex-wrap min-w-max sm:min-w-0">
          <span className="inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 whitespace-nowrap">
            <Inbox className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
            {stats.total} Pending
          </span>
          {stats.high > 0 && (
            <span className="inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 whitespace-nowrap">
              <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
              {stats.high} High
            </span>
          )}
          {stats.medium > 0 && (
            <span className="inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 whitespace-nowrap">
              <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
              {stats.medium} Med
            </span>
          )}
          {stats.low > 0 && (
            <span className="inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 whitespace-nowrap">
              <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
              {stats.low} Low
            </span>
          )}
        </div>
      </div>

      {progress.total > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Review Progress
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {progress.reviewed} of {progress.total} signals reviewed
            </span>
          </div>
          <Progress.Root
            className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
            value={progress.percentage}
          >
            <Progress.Indicator
              className="h-full rounded-full bg-brand-blue transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(-${100 - progress.percentage}%)`,
              }}
            />
          </Progress.Root>
          {progress.percentage === 100 && progress.total > 0 && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4" />
              All signals reviewed! Great job.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
