/**
 * In-flight progress block shown in the modal footer while the bulk
 * export is running. Renders the animated spinner, progress ring, elapsed
 * + remaining timers, and the long-export warning.
 *
 * @module components/BulkExportModal/ExportProgressIndicator
 */

import { AlertTriangle, Clock, Loader2, Sparkles } from "lucide-react";

import { COA_COLORS, formatTime } from "./constants";

export interface ExportProgressIndicatorProps {
  elapsedTime: number;
  estimatedTotalTime: number;
  showLongExportWarning: boolean;
}

export function ExportProgressIndicator({
  elapsedTime,
  estimatedTotalTime,
  showLongExportWarning,
}: ExportProgressIndicatorProps) {
  const ringProgress =
    estimatedTotalTime > 0
      ? Math.min((elapsedTime / estimatedTotalTime) * 113, 113)
      : 0;

  return (
    <div className="mb-4">
      <div
        className="flex items-center gap-3 p-3 rounded-lg"
        style={{ backgroundColor: COA_COLORS.lightBlue }}
      >
        <div className="relative flex-shrink-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center animate-pulse"
            style={{ backgroundColor: `${COA_COLORS.logoBlue}20` }}
          >
            <Loader2
              className="h-5 w-5 animate-spin"
              style={{ color: COA_COLORS.logoBlue }}
            />
          </div>
          {estimatedTotalTime > 0 && (
            <svg
              className="absolute inset-0 w-full h-full -rotate-90"
              viewBox="0 0 40 40"
            >
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="none"
                stroke={`${COA_COLORS.logoBlue}30`}
                strokeWidth="3"
              />
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="none"
                stroke={COA_COLORS.logoBlue}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${ringProgress} 113`}
                className="transition-all duration-1000"
              />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium"
              style={{ color: COA_COLORS.darkBlue }}
            >
              Generating portfolio...
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: `${COA_COLORS.logoBlue}15`,
                color: COA_COLORS.logoBlue,
              }}
            >
              <Sparkles className="h-3 w-3" />
              AI Synthesis
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              Elapsed: {formatTime(elapsedTime)}
            </span>
            {estimatedTotalTime > elapsedTime && (
              <span className="text-xs text-gray-400">
                Est. ~
                {formatTime(Math.max(0, estimatedTotalTime - elapsedTime))}{" "}
                remaining
              </span>
            )}
          </div>
        </div>
      </div>

      {showLongExportWarning && (
        <div
          className="flex items-center gap-2 mt-2 p-2 rounded-lg text-xs"
          style={{
            backgroundColor: `${COA_COLORS.amber}15`,
            color: COA_COLORS.amber,
          }}
        >
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Export is taking longer than expected. Please wait while we generate
            your portfolio.
          </span>
        </div>
      )}
    </div>
  );
}
