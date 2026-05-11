/**
 * Centered error/empty-state card for the kanban page. Used for both
 * "you don't have access / workstream broken" and "not found" branches.
 *
 * @module pages/WorkstreamKanban/ErrorState
 */

import { Link } from "react-router-dom";
import { ArrowLeft, Filter } from "lucide-react";

export interface ErrorStateProps {
  title: string;
  description: string;
  iconColorClass: string;
}

export function ErrorState({
  title,
  description,
  iconColorClass,
}: ErrorStateProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
        <div className={iconColorClass}>
          <Filter className="mx-auto h-12 w-12" />
        </div>
        <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white mb-2">
          {title}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{description}</p>
        <Link
          to="/workstreams"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-brand-dark-blue transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Workstreams
        </Link>
      </div>
    </div>
  );
}
