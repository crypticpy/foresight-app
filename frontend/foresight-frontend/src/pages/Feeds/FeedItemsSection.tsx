/**
 * Expandable feed-items list with a triage-result filter bar. Used inside
 * `FeedCard` when the user toggles a feed open. The wrapper resolves the
 * auth token before mounting the inner list.
 *
 * @module pages/Feeds/FeedItemsSection
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Filter, Loader2 } from "lucide-react";
import { getFeedItems, type FeedItem } from "../../lib/feeds-api";
import { TRIAGE_FILTERS } from "./constants";
import { formatRelativeTime, getTriageColor } from "./helpers";

interface FeedItemsSectionProps {
  feedId: string;
  token: string;
}

function FeedItemsSection({ feedId, token }: FeedItemsSectionProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triageFilter, setTriageFilter] = useState("all");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getFeedItems(token, feedId, {
        limit: 50,
        triage_result: triageFilter === "all" ? undefined : triageFilter,
      });
      setItems(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, [feedId, token, triageFilter]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-dark-surface-elevated/50">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-700/50">
        <Filter className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Filter:
        </span>
        {TRIAGE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setTriageFilter(f.value)}
            className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
              triageFilter === f.value
                ? "bg-brand-blue text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              Loading items...
            </span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-sm text-red-500">
            <AlertCircle className="w-4 h-4 mr-2" />
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
            No items found
            {triageFilter !== "all" ? " matching this filter" : ""}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2 hidden sm:table-cell">Published</th>
                <th className="px-4 py-2 hidden md:table-cell">Triage</th>
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-100/50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td className="px-4 py-2">
                    <span className="text-gray-900 dark:text-white line-clamp-1">
                      {item.title}
                    </span>
                  </td>
                  <td className="px-4 py-2 hidden sm:table-cell text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {item.published_at
                      ? formatRelativeTime(item.published_at)
                      : "--"}
                  </td>
                  <td
                    className={`px-4 py-2 hidden md:table-cell font-medium whitespace-nowrap ${getTriageColor(item.triage_result)}`}
                  >
                    {item.triage_result || "unprocessed"}
                  </td>
                  <td className="px-4 py-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-brand-blue transition-colors"
                      title="Open article"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface FeedItemsSectionWrapperProps {
  feedId: string;
  getToken: () => Promise<string>;
}

export function FeedItemsSectionWrapper({
  feedId,
  getToken,
}: FeedItemsSectionWrapperProps) {
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    getToken()
      .then(setToken)
      .catch((err: unknown) => {
        setTokenError(
          err instanceof Error ? err.message : "Failed to authenticate",
        );
      });
  }, [getToken]);

  if (tokenError) {
    return (
      <div className="flex items-center gap-2 py-6 px-4 border-t border-gray-200 dark:border-gray-700 text-sm text-red-600 dark:text-red-400">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>{tokenError}</span>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center py-6 border-t border-gray-200 dark:border-gray-700">
        <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
      </div>
    );
  }

  return <FeedItemsSection feedId={feedId} token={token} />;
}
