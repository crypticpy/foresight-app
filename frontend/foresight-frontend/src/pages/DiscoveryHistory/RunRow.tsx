/**
 * Single discovery-run row: header summary with status badge + key counts,
 * inline progress indicator when running, plus an expandable details panel
 * (config, created cards, summary markdown, errors, timestamps).
 *
 * @module pages/DiscoveryHistory/RunRow
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  StopCircle,
  TrendingUp,
} from "lucide-react";
import type { DiscoveryRun } from "../../lib/discovery-api";
import { StatusBadge } from "./StatusBadge";
import { ProgressIndicator } from "./ProgressIndicator";
import { formatDate, formatDuration, getRelativeTime } from "./formatters";

interface RunRowProps {
  run: DiscoveryRun;
  onCancel: (runId: string) => void;
  cancelling: boolean;
}

export function RunRow({ run, onCancel, cancelling }: RunRowProps) {
  const [expanded, setExpanded] = useState(false);

  const summaryReport =
    run.summary_report && typeof run.summary_report === "object"
      ? (run.summary_report as Record<string, unknown>)
      : {};

  const configFromSummary = summaryReport.config;
  const markdownReport =
    typeof summaryReport.markdown === "string" ? summaryReport.markdown : null;
  const createdCardIds = Array.isArray(summaryReport.cards_created_ids)
    ? (summaryReport.cards_created_ids as string[])
    : [];

  const derivedErrors = (() => {
    const detailsErrors = (run.error_details as Record<string, unknown> | null)
      ?.errors;
    if (Array.isArray(detailsErrors)) return detailsErrors as string[];
    const reportErrors = summaryReport.errors;
    if (Array.isArray(reportErrors)) return reportErrors as string[];
    return [];
  })();

  const runProgress = (
    run.summary_report as {
      progress?: {
        current_stage?: string;
        message?: string;
        stages?: Record<string, string>;
        stats?: Record<string, number>;
      };
    }
  )?.progress;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-dark-surface">
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity flex-1"
        >
          <StatusBadge status={run.status} />
          <div className="text-left">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {formatDate(run.started_at)}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {getRelativeTime(run.started_at)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <FileText className="w-4 h-4" />
              <span>{run.sources_found} sources</span>
            </div>
            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <TrendingUp className="w-4 h-4" />
              <span>{run.cards_created || 0} created</span>
            </div>
            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <RefreshCw className="w-4 h-4" />
              <span>{run.cards_enriched || 0} updated</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              <span>{formatDuration(run.started_at, run.completed_at)}</span>
            </div>
          </div>

          {run.status === "running" && (
            <button
              onClick={() => onCancel(run.id)}
              disabled={cancelling}
              className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
              title="Cancel run"
            >
              {cancelling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <StopCircle className="w-4 h-4" />
              )}
            </button>
          )}

          <div
            onClick={() => setExpanded(!expanded)}
            className="cursor-pointer p-1"
          >
            <ChevronRight
              className={`w-5 h-5 text-gray-400 transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
            />
          </div>
        </div>
      </div>

      {run.status === "running" && (
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/10 border-t border-blue-200 dark:border-blue-800">
          <ProgressIndicator progress={runProgress || null} />
        </div>
      )}

      {expanded && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="sm:hidden grid grid-cols-2 gap-3 mb-4">
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Sources:</span>{" "}
              <span className="font-medium">{run.sources_found}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Created:</span>{" "}
              <span className="font-medium text-green-600">
                {run.cards_created || 0}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Updated:</span>{" "}
              <span className="font-medium text-blue-600">
                {run.cards_enriched || 0}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                Duration:
              </span>{" "}
              <span className="font-medium">
                {formatDuration(run.started_at, run.completed_at)}
              </span>
            </div>
          </div>

          {configFromSummary != null &&
            typeof configFromSummary === "object" && (
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Configuration
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {Object.entries(
                    configFromSummary as Record<string, unknown>,
                  ).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400 min-w-[140px]">
                        {key}:
                      </span>
                      <span className="text-gray-900 dark:text-gray-100 break-words">
                        {Array.isArray(value)
                          ? value.join(", ")
                          : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {createdCardIds.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Created Signals
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {createdCardIds.length} card(s) created in this run.
                </div>
                <Link
                  to="/discover/queue"
                  className="text-sm text-brand-blue hover:text-brand-dark-blue dark:text-blue-400 dark:hover:text-blue-300"
                >
                  View review queue →
                </Link>
              </div>
            </div>
          )}

          {markdownReport && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Summary Report
              </div>
              <div className="text-sm whitespace-pre-wrap bg-white dark:bg-dark-surface border border-gray-200 dark:border-gray-700 rounded p-3 max-h-64 overflow-auto">
                {markdownReport}
              </div>
            </div>
          )}

          {derivedErrors.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">
                Errors ({derivedErrors.length})
              </div>
              <div className="space-y-1">
                {derivedErrors.slice(0, 5).map((error, idx) => (
                  <div
                    key={idx}
                    className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1"
                  >
                    {error}
                  </div>
                ))}
                {derivedErrors.length > 5 && (
                  <div className="text-sm text-red-500 italic">
                    +{derivedErrors.length - 5} more errors
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            <div>Started: {new Date(run.started_at).toLocaleString()}</div>
            {run.completed_at && (
              <div>
                Completed: {new Date(run.completed_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
