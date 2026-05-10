/**
 * Six-column Kanban explainer with click-to-detail behaviour. The column
 * metadata is local because no other component consumes it — keeping it
 * private avoids leaking guide-only copy into the rest of the app.
 *
 * @module pages/GuideWorkstreams/InteractiveKanban
 */

import { useState, type ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  CheckCircle,
  Eye,
  FileText,
  Filter,
  Inbox,
  Search,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface KanbanColumnInfo {
  id: string;
  title: string;
  color: string;
  bgColor: string;
  icon: ReactNode;
  description: string;
  workflow: string;
  actions: string[];
}

const KANBAN_COLUMN_INFO: KanbanColumnInfo[] = [
  {
    id: "inbox",
    title: "Inbox",
    color: "text-gray-600 dark:text-gray-300",
    bgColor: "bg-gray-100 dark:bg-gray-700",
    icon: <Inbox className="h-4 w-4" />,
    description:
      "The landing zone for all new signals. Cards arrive here via auto-populate, manual additions from Discover, or workstream scans.",
    workflow:
      "Triage quickly: skim the signal, decide if it warrants further attention.",
    actions: ["Move to Screening or Archive", "Add notes for context"],
  },
  {
    id: "screening",
    title: "Screening",
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    icon: <Filter className="h-4 w-4" />,
    description:
      "Initial evaluation stage. Run a Quick Update to gather a concise 5-source research snapshot and decide if the signal is worth a deeper look.",
    workflow:
      "Read the quick update summary, then promote or dismiss the signal.",
    actions: ["Quick Update (5-source scan)", "Move to Research or Archive"],
  },
  {
    id: "research",
    title: "Research",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    icon: <Search className="h-4 w-4" />,
    description:
      "Deep investigation stage. Trigger a Deep Dive for comprehensive AI research using 15+ sources. The system pulls from academic, government, and industry sources.",
    workflow:
      "Wait for research to complete, review findings, add your own notes.",
    actions: [
      "Deep Dive Research (15+ sources)",
      "Add contextual notes",
      "Move to Brief when ready",
    ],
  },
  {
    id: "brief",
    title: "Brief",
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    icon: <FileText className="h-4 w-4" />,
    description:
      "Leadership-ready stage. Generate an AI executive brief with structured sections. Preview, iterate with version history, then export as PDF or PowerPoint.",
    workflow:
      "Generate brief, review in the preview modal, export for stakeholders.",
    actions: [
      "Generate Executive Brief",
      "Preview & iterate versions",
      "Export as PDF or PPTX",
      "Bulk export for portfolios",
    ],
  },
  {
    id: "watching",
    title: "Watching",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    icon: <Eye className="h-4 w-4" />,
    description:
      "Ongoing monitoring stage. Signals here have been briefed or are important enough to track. Use Check for Updates to poll for new developments periodically.",
    workflow:
      "Periodically check for updates; move back to Research if activity spikes.",
    actions: [
      "Check for Updates",
      "Move back to Research if needed",
      "Archive when no longer relevant",
    ],
  },
  {
    id: "archived",
    title: "Archived",
    color: "text-gray-500 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-600",
    icon: <Archive className="h-4 w-4" />,
    description:
      "Completed or deprioritized signals. Archived cards remain accessible but do not appear in active workflows. You can always move them back if circumstances change.",
    workflow: "No active work needed. Reference for historical context.",
    actions: ["Restore to any column if needed"],
  },
];

export function InteractiveKanban() {
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const selected = KANBAN_COLUMN_INFO.find((c) => c.id === selectedColumn);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Click on a column below to learn about its purpose, workflow, and
        available actions.
      </p>

      {/* Column strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {KANBAN_COLUMN_INFO.map((col, idx) => (
          <div key={col.id} className="relative">
            <button
              type="button"
              onClick={() =>
                setSelectedColumn(selectedColumn === col.id ? null : col.id)
              }
              className={cn(
                "w-full rounded-lg p-3 text-center transition-all duration-200 border-2",
                col.bgColor,
                selectedColumn === col.id
                  ? "border-brand-blue shadow-md scale-[1.02]"
                  : "border-transparent hover:border-brand-blue/30",
              )}
            >
              <div className={cn("mx-auto mb-1", col.color)}>{col.icon}</div>
              <div className="text-xs font-semibold text-gray-900 dark:text-white">
                {col.title}
              </div>
            </button>
            {idx < KANBAN_COLUMN_INFO.length - 1 && (
              <ArrowRight className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 z-10" />
            )}
          </div>
        ))}
      </div>

      {/* Details panel */}
      {selected && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 mb-3">
            <div
              className={cn(
                "p-1.5 rounded-lg",
                selected.bgColor,
                selected.color,
              )}
            >
              {selected.icon}
            </div>
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">
              {selected.title}
            </h4>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            {selected.description}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 text-sm">
            <div className="flex-1">
              <h5 className="font-medium text-gray-900 dark:text-white mb-1">
                Workflow
              </h5>
              <p className="text-gray-600 dark:text-gray-400">
                {selected.workflow}
              </p>
            </div>
            <div className="flex-1">
              <h5 className="font-medium text-gray-900 dark:text-white mb-1">
                Available Actions
              </h5>
              <ul className="space-y-1">
                {selected.actions.map((action, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-gray-600 dark:text-gray-400"
                  >
                    <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-brand-green flex-shrink-0" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
