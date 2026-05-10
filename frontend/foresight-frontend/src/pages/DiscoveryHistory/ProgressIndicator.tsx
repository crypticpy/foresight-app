/**
 * Live progress strip for an in-flight discovery run: pipeline stage chips
 * (queries → search → triage → blocked → dedupe → cards) plus a flexible
 * stats row driven by whatever counts the worker has reported so far.
 *
 * @module pages/DiscoveryHistory/ProgressIndicator
 */

import type { ElementType } from "react";
import {
  CheckCircle,
  ChevronRight,
  Copy,
  FileText,
  Filter,
  Loader2,
  Search,
  Sparkles,
  StopCircle,
} from "lucide-react";

interface ProgressStage {
  id: string;
  label: string;
  icon: ElementType;
}

const DISCOVERY_STAGES: ProgressStage[] = [
  { id: "queries", label: "Generate Queries", icon: FileText },
  { id: "search", label: "Search Sources", icon: Search },
  { id: "triage", label: "Triage Results", icon: Filter },
  { id: "blocked", label: "Filter Blocked", icon: StopCircle },
  { id: "dedupe", label: "Deduplicate", icon: Copy },
  { id: "cards", label: "Create Cards", icon: Sparkles },
];

interface ProgressIndicatorProps {
  progress: {
    current_stage?: string;
    message?: string;
    stages?: Record<string, string>;
    stats?: Record<string, number>;
  } | null;
}

export function ProgressIndicator({ progress }: ProgressIndicatorProps) {
  if (!progress) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
        Starting discovery run...
      </div>
    );
  }

  const { message, stages, stats } = progress;

  return (
    <div className="space-y-3">
      {message && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{message}</span>
        </div>
      )}

      <div className="flex items-center gap-1">
        {DISCOVERY_STAGES.map((stage, idx) => {
          const status = stages?.[stage.id] || "pending";
          const Icon = stage.icon;

          return (
            <div key={stage.id} className="flex items-center">
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  status === "completed"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : status === "in_progress"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
                }`}
                title={stage.label}
              >
                {status === "completed" ? (
                  <CheckCircle className="w-3 h-3" />
                ) : status === "in_progress" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                <span className="hidden sm:inline">{stage.label}</span>
              </div>
              {idx < DISCOVERY_STAGES.length - 1 && (
                <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 ml-1" />
              )}
            </div>
          );
        })}
      </div>

      {stats && Object.keys(stats).length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
          {stats.queries_generated !== undefined && (
            <span>Queries: {stats.queries_generated}</span>
          )}
          {stats.sources_found !== undefined && (
            <span>Sources: {stats.sources_found}</span>
          )}
          {stats.sources_relevant !== undefined && (
            <span>Relevant: {stats.sources_relevant}</span>
          )}
          {stats.duplicates !== undefined && (
            <span>Duplicates: {stats.duplicates}</span>
          )}
          {stats.new_concepts !== undefined && (
            <span>New: {stats.new_concepts}</span>
          )}
        </div>
      )}
    </div>
  );
}
