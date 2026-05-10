/**
 * Dashboard header: friendly-name greeting, plus the Commands (⌘K palette)
 * and Refresh buttons. The composer owns the palette + refresh state and
 * wires it down via props.
 *
 * @module pages/Dashboard/DashboardHeader
 */

import { Command, RefreshCw } from "lucide-react";

interface DashboardHeaderProps {
  email?: string;
  onOpenPalette: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

function friendlyName(email?: string): string {
  const username = email?.split("@")[0];
  if (!username) return "Welcome back";
  const friendly = username
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return `Welcome back, ${friendly}`;
}

export function DashboardHeader({
  email,
  onOpenPalette,
  onRefresh,
  refreshing,
}: DashboardHeaderProps) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-brand-dark-blue dark:text-white">
          {friendlyName(email)}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Here's what's happening in your strategic intelligence feed.
        </p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette (⌘K)"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-surface-hover transition-colors"
        >
          <Command className="h-4 w-4" />
          <span className="hidden sm:inline">Commands</span>
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-surface-hover text-gray-500 dark:text-gray-400">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh dashboard"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-surface-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
