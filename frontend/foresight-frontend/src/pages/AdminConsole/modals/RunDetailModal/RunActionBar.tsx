/**
 * Recovery action buttons surfaced inside the run detail modal. The actions
 * are global (date-window based), not scoped to this single run, but a stuck
 * run is the most common reason to reach for them.
 *
 * @module pages/AdminConsole/modals/RunDetailModal/RunActionBar
 */

import { Loader2, Play } from "lucide-react";

export function RunActionBar({
  onAction,
  inFlight,
}: {
  onAction: (action: "recover" | "reprocess" | "recover-analyzed") => void;
  inFlight: string | null;
}) {
  const buttons: Array<{
    id: "recover" | "reprocess" | "recover-analyzed";
    label: string;
    description: string;
  }> = [
    {
      id: "recover",
      label: "Recover orphans",
      description: "Re-feed orphaned sources through the signal agent.",
    },
    {
      id: "reprocess",
      label: "Reprocess errored",
      description: "Re-run triage + analysis from scratch on errored sources.",
    },
    {
      id: "recover-analyzed",
      label: "Recover analyzed errors",
      description:
        "Use existing analysis to retry sources that failed at card creation.",
    },
  ];
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-dark-surface-elevated">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
        Recovery actions
      </h3>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        These run against the global recovery date window — they are not scoped
        to this single run, but a stuck run is the most common reason to invoke
        them.
      </p>
      <div className="flex flex-wrap gap-2">
        {buttons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            disabled={inFlight !== null}
            onClick={() => onAction(btn.id)}
            title={btn.description}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-brand-blue hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-50 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
          >
            {inFlight === btn.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
