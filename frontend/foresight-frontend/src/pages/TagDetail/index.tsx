/**
 * Tag detail page (`/tags/:slug`). Header with tag label + total,
 * followed by a paginated grid of card tiles. Each tile links to the
 * standard signal detail route.
 *
 * @module pages/TagDetail
 */

import { useCallback, useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Tag as TagIcon,
} from "lucide-react";

import { useAuthContext } from "../../hooks/useAuthContext";
import { useTagDetail } from "../../hooks/useTagDetail";
import { getAuthToken } from "../../lib/auth";
import { TagCardTile } from "./TagCardTile";

export default function TagDetail() {
  useAuthContext();
  const { slug = "" } = useParams<{ slug: string }>();

  const {
    tag,
    cards,
    total,
    loading,
    isFetchingMore,
    hasMore,
    error,
    loadMore,
    refresh,
  } = useTagDetail(slug, getAuthToken);

  // Infinite scroll sentinel — mirrors the Signals page pattern.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleRetry = useCallback(() => refresh(), [refresh]);

  // 404 path: the loader has settled, no tag, and no error. The router
  // never returns null for /tags/:slug otherwise, so the only way to land
  // here is a genuine missing-tag response from the API.
  const isMissing = !loading && !error && !tag;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        to="/signals"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-blue dark:text-gray-400 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to signals
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3">
          <TagIcon className="h-6 w-6 text-brand-blue" />
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            {tag?.label ?? slug}
          </h1>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {loading
            ? "Loading…"
            : isMissing
              ? "This tag has no record."
              : total === 1
                ? "1 card carries this tag."
                : `${total} cards carry this tag.`}
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">
                {error}
              </p>
              <button
                onClick={handleRetry}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-brand-blue animate-spin" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Loading tagged cards…
          </p>
        </div>
      ) : isMissing ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-dark-surface-hover p-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We couldn't find a tag with the slug{" "}
            <code className="font-mono text-brand-blue">{slug}</code>. It may
            have been merged or removed.
          </p>
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-dark-surface-hover p-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No cards carry this tag yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <TagCardTile key={card.id} card={card} />
          ))}
        </div>
      )}

      <div
        ref={sentinelRef}
        className="h-12 mt-6 flex items-center justify-center"
      >
        {isFetchingMore && (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more…
          </span>
        )}
        {!hasMore && cards.length > 0 && (
          <span
            role="status"
            aria-live="polite"
            className="text-xs text-gray-400 dark:text-gray-500"
          >
            You're all caught up.
          </span>
        )}
      </div>
    </div>
  );
}
