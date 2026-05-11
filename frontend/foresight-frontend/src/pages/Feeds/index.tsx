/**
 * Feeds page composer: orchestrates feed listing, add/edit/delete, manual
 * "check now" trigger, and per-feed item expansion. Owns top-level data
 * fetching and modal state.
 *
 * @module pages/Feeds
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Rss,
} from "lucide-react";
import { getAuthToken } from "../../lib/auth";
import { useAuthContext } from "../../hooks/useAuthContext";
import { LoadingButton } from "../../components/ui/LoadingButton";
import {
  createFeed,
  deleteFeed,
  getFeeds,
  triggerCheck,
  updateFeed,
  type CreateFeedPayload,
  type Feed,
  type UpdateFeedPayload,
} from "../../lib/feeds-api";
import { FeedCard } from "./FeedCard";
import { FeedModal } from "./FeedModal";
import { SummaryStats } from "./SummaryStats";

export default function Feeds() {
  useAuthContext();

  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [expandedFeedId, setExpandedFeedId] = useState<string | null>(null);

  const getToken = useCallback(async (): Promise<string> => {
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");
    return token;
  }, []);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const data = await getFeeds(token);
      setFeeds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feeds");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const handleSubmitFeed = async (
    payload: CreateFeedPayload | UpdateFeedPayload,
  ) => {
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (editingFeed) {
        await updateFeed(token, editingFeed.id, payload as UpdateFeedPayload);
      } else {
        await createFeed(token, payload as CreateFeedPayload);
      }
      setIsModalOpen(false);
      setEditingFeed(null);
      await loadFeeds();
    } catch (err) {
      console.error("Feed save error:", err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFeed = async (feedId: string) => {
    if (!window.confirm("Are you sure you want to delete this feed?")) return;
    setDeletingId(feedId);
    try {
      const token = await getToken();
      await deleteFeed(token, feedId);
      if (expandedFeedId === feedId) setExpandedFeedId(null);
      await loadFeeds();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete feed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCheckNow = async () => {
    setIsChecking(true);
    setCheckMessage(null);
    try {
      const token = await getToken();
      const result = await triggerCheck(token);
      setCheckMessage(
        result.message || `Checked ${result.feeds_checked} feeds`,
      );
      setTimeout(() => {
        loadFeeds();
        setCheckMessage(null);
      }, 3000);
    } catch (err) {
      setCheckMessage(err instanceof Error ? err.message : "Check failed");
      setTimeout(() => setCheckMessage(null), 5000);
    } finally {
      setIsChecking(false);
    }
  };

  const handleEditFeed = (feed: Feed) => {
    setEditingFeed(feed);
    setIsModalOpen(true);
  };

  const handleAddFeed = () => {
    setEditingFeed(null);
    setIsModalOpen(true);
  };

  const toggleExpanded = (feedId: string) => {
    setExpandedFeedId((prev) => (prev === feedId ? null : feedId));
  };

  const activeCount = feeds.filter((f) => f.status === "active").length;
  const errorCount = feeds.filter((f) => f.status === "error").length;
  const totalArticles = feeds.reduce(
    (sum, f) => sum + f.articles_found_total,
    0,
  );
  const totalMatched = feeds.reduce(
    (sum, f) => sum + f.articles_matched_total,
    0,
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-blue/10 rounded-lg">
              <Rss className="w-6 h-6 text-brand-blue" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                RSS Feeds
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Monitor curated RSS feeds for emerging signals
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LoadingButton
            variant="secondary"
            size="sm"
            loading={isChecking}
            loadingText="Checking..."
            onClick={handleCheckNow}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Check Now
          </LoadingButton>
          <LoadingButton variant="primary" size="sm" onClick={handleAddFeed}>
            <Plus className="w-4 h-4 mr-2" />
            Add Feed
          </LoadingButton>
        </div>
      </div>

      {checkMessage && (
        <div className="mb-4 px-4 py-2 bg-brand-blue/10 text-brand-blue text-sm rounded-lg border border-brand-blue/20 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {checkMessage}
        </div>
      )}

      {!loading && feeds.length > 0 && (
        <SummaryStats
          total={feeds.length}
          activeCount={activeCount}
          totalArticles={totalArticles}
          totalMatched={totalMatched}
        />
      )}

      {!loading && errorCount > 0 && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              {errorCount} feed{errorCount > 1 ? "s" : ""} reporting errors
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Check the error details below and verify the feed URLs are
              correct.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">
            Loading feeds...
          </span>
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <LoadingButton variant="secondary" size="sm" onClick={loadFeeds}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </LoadingButton>
        </div>
      ) : feeds.length === 0 ? (
        <div className="text-center py-16">
          <Rss className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No feeds configured
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Add RSS feeds to automatically monitor for emerging signals and
            trends relevant to Austin's strategic priorities.
          </p>
          <LoadingButton variant="primary" size="md" onClick={handleAddFeed}>
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Feed
          </LoadingButton>
        </div>
      ) : (
        <div className="space-y-3">
          {feeds.map((feed) => (
            <FeedCard
              key={feed.id}
              feed={feed}
              isExpanded={expandedFeedId === feed.id}
              isDeleting={deletingId === feed.id}
              onToggleExpand={toggleExpanded}
              onEdit={handleEditFeed}
              onDelete={handleDeleteFeed}
              getToken={getToken}
            />
          ))}
        </div>
      )}

      <FeedModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingFeed(null);
        }}
        onSubmit={handleSubmitFeed}
        initialData={editingFeed}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
