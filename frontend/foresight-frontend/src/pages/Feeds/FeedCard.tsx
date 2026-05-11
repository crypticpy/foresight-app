/**
 * Single feed card: header row with status icon + name + category/pillar
 * badges, stats line, optional error message, action buttons (expand /
 * open / edit / delete), plus the expandable items list below.
 *
 * @module pages/Feeds/FeedCard
 */

import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";
import type { Feed } from "../../lib/feeds-api";
import { FeedItemsSectionWrapper } from "./FeedItemsSection";
import {
  formatRelativeTime,
  getCategoryColor,
  getCategoryLabel,
  getStatusIcon,
} from "./helpers";

interface FeedCardProps {
  feed: Feed;
  isExpanded: boolean;
  isDeleting: boolean;
  onToggleExpand: (feedId: string) => void;
  onEdit: (feed: Feed) => void;
  onDelete: (feedId: string) => void;
  getToken: () => Promise<string>;
}

export function FeedCard({
  feed,
  isExpanded,
  isDeleting,
  onToggleExpand,
  onEdit,
  onDelete,
  getToken,
}: FeedCardProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-shadow hover:shadow-md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getStatusIcon(feed.status)}
              <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                {feed.name}
              </h3>
              <span
                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getCategoryColor(feed.category)}`}
              >
                {getCategoryLabel(feed.category)}
              </span>
              {feed.pillar_id && (
                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-brand-blue/10 text-brand-blue">
                  {feed.pillar_id}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">
              {feed.url}
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>
                <strong className="text-gray-700 dark:text-gray-300">
                  {feed.articles_found_total}
                </strong>{" "}
                found
              </span>
              <span>
                <strong className="text-gray-700 dark:text-gray-300">
                  {feed.articles_matched_total}
                </strong>{" "}
                matched
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(feed.last_checked_at)}
              </span>
              <span>Every {feed.check_interval_hours}h</span>
              {feed.error_count > 0 && (
                <span className="flex items-center gap-1 text-red-500">
                  <AlertCircle className="w-3 h-3" />
                  {feed.error_count} error
                  {feed.error_count > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {feed.last_error && (
              <div className="mt-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-md">
                <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">
                  {feed.last_error}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onToggleExpand(feed.id)}
              className="p-2 text-gray-400 hover:text-brand-blue hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title={isExpanded ? "Collapse" : "Show items"}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            <a
              href={feed.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-brand-blue hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="Open feed URL"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={() => onEdit(feed)}
              className="p-2 text-gray-400 hover:text-brand-blue hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="Edit feed"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(feed.id)}
              disabled={isDeleting}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
              title="Delete feed"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <FeedItemsSectionWrapper feedId={feed.id} getToken={getToken} />
      )}
    </div>
  );
}
