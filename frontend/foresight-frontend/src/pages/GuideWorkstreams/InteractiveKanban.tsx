/**
 * Four-column Kanban explainer with click-to-detail behaviour. The column
 * metadata is local because no other component consumes it — keeping it
 * private avoids leaking guide-only copy into the rest of the app. Mirrors
 * the live board: inbox → working → ready → archived (see
 * `components/kanban/types.ts`). "Watching" is an orthogonal flag, not a
 * column, so it is described separately below the strip.
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
      "The landing zone for every new, untriaged signal. Cards arrive here via auto-populate, manual additions from Discover, or workstream scans.",
    workflow:
      "Skim each signal and triage fast — accept the promising ones, dismiss the rest. Keyboard shortcuts make a long inbox quick to clear.",
    actions: [
      "Accept (✓) → moves the card to Working",
      "Dismiss (✗) → moves the card to Archived",
      "Watch (👁) to track it without committing",
      "Add notes for context",
    ],
  },
  {
    id: "working",
    title: "Working",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    icon: <Search className="h-4 w-4" />,
    description:
      "Signals you've accepted and are actively investigating. This is where AI research happens — from a quick snapshot to a deep, multi-source dive.",
    workflow:
      "Run a Quick Update for a fast read or a Deep Dive for a comprehensive 15+ source package, add your own notes, then move to Ready once you have something worth sharing.",
    actions: [
      "Quick Update (concise scan)",
      "Deep Dive Research (15+ sources)",
      "Add contextual notes",
      "Move to Ready",
    ],
  },
  {
    id: "ready",
    title: "Ready",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    icon: <FileText className="h-4 w-4" />,
    description:
      "Signals that have a shareable artifact — an executive brief or an export — ready to put in front of leadership.",
    workflow:
      "Generate or refine the executive brief, preview and iterate with version history, then export as PDF or PowerPoint.",
    actions: [
      "Generate Executive Brief",
      "Preview & iterate versions",
      "Export as PDF or PPTX",
      "Bulk export for portfolios",
    ],
  },
  {
    id: "archived",
    title: "Archived",
    color: "text-gray-500 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-600",
    icon: <Archive className="h-4 w-4" />,
    description:
      "Completed or dismissed signals. They stay fully accessible for reference but drop out of your active workflow.",
    workflow:
      "No active work needed. Restore a card to Working if circumstances change.",
    actions: ["Restore to Working", "Reference for historical context"],
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

      {/* Watching is a flag, not a column — clarify so readers don't look for
          a "Watching" lane that no longer exists. */}
      <div className="flex items-start gap-2 rounded-lg border border-pink-200 dark:border-pink-900/40 bg-pink-50 dark:bg-pink-900/10 p-3 text-sm">
        <Eye className="h-4 w-4 mt-0.5 flex-shrink-0 text-pink-600 dark:text-pink-400" />
        <p className="text-gray-700 dark:text-gray-300">
          <span className="font-medium text-gray-900 dark:text-white">
            Watching
          </span>{" "}
          isn't a column — it's a flag you can toggle on any card, in any
          column, to keep an eye on it. Watched cards stay where they are; the
          flag just marks them as ones you're tracking.
        </p>
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
