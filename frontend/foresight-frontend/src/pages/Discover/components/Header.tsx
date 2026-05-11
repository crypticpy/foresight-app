/**
 * Page header: title + supporting nav buttons (How to use, Compare toggle,
 * Saved Searches toggle, Review Queue link, Run History link).
 *
 * @module pages/Discover/components/Header
 */

import {
  ArrowLeftRight,
  Bookmark,
  BookOpen,
  History,
  Inbox,
} from "lucide-react";
import { Link } from "react-router-dom";

export interface DiscoverHeaderProps {
  compareMode: boolean;
  isSidebarOpen: boolean;
  onToggleCompare: () => void;
  onToggleSidebar: () => void;
}

export function DiscoverHeader({
  compareMode,
  isSidebarOpen,
  onToggleCompare,
  onToggleSidebar,
}: DiscoverHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark-blue dark:text-white">
            Discover Intelligence
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Explore emerging trends and technologies relevant to Austin&apos;s
            strategic priorities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/guide/discover"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            How to use
          </Link>
          <button
            onClick={onToggleCompare}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              compareMode
                ? "text-white bg-extended-purple border border-extended-purple"
                : "text-extended-purple bg-extended-purple/10 border border-extended-purple/30 hover:bg-extended-purple hover:text-white"
            }`}
            aria-pressed={compareMode}
          >
            <ArrowLeftRight className="w-4 h-4" />
            {compareMode ? "Exit Compare" : "Compare"}
          </button>
          <button
            onClick={onToggleSidebar}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isSidebarOpen
                ? "text-brand-blue bg-brand-light-blue dark:bg-brand-blue/20 border border-brand-blue/30"
                : "text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            aria-pressed={isSidebarOpen}
          >
            <Bookmark className="w-4 h-4" />
            Saved Searches
          </button>
          <Link
            to="/discover/queue"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Inbox className="w-4 h-4" />
            Review Queue
          </Link>
          <Link
            to="/discover/history"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <History className="w-4 h-4" />
            Run History
          </Link>
        </div>
      </div>
    </div>
  );
}
