/**
 * Add/edit feed modal. Owns its local form state and re-syncs whenever the
 * incoming `initialData` changes (edit vs add).
 *
 * @module pages/Feeds/FeedModal
 */

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { LoadingButton } from "../../components/ui/LoadingButton";
import type {
  CreateFeedPayload,
  Feed,
  UpdateFeedPayload,
} from "../../lib/feeds-api";
import { FEED_CATEGORIES, PILLARS } from "./constants";

interface FeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateFeedPayload | UpdateFeedPayload) => Promise<void>;
  initialData?: Feed | null;
  isSubmitting: boolean;
}

export function FeedModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isSubmitting,
}: FeedModalProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("general");
  const [pillarId, setPillarId] = useState("");
  const [checkInterval, setCheckInterval] = useState(6);

  useEffect(() => {
    if (initialData) {
      setUrl(initialData.url);
      setName(initialData.name);
      setCategory(initialData.category || "general");
      setPillarId(initialData.pillar_id || "");
      setCheckInterval(initialData.check_interval_hours || 6);
    } else {
      setUrl("");
      setName("");
      setCategory("general");
      setPillarId("");
      setCheckInterval(6);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload: CreateFeedPayload = {
      url,
      name,
      category,
      pillar_id: pillarId || null,
      check_interval_hours: checkInterval,
    };
    await onSubmit(payload);
  };

  const isEditing = !!initialData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-dark-surface rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? "Edit Feed" : "Add New Feed"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label
              htmlFor="feed-url"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Feed URL <span className="text-red-500">*</span>
            </label>
            <input
              id="feed-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="feed-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Feed Name <span className="text-red-500">*</span>
            </label>
            <input
              id="feed-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., GovTech Weekly"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="feed-category"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Category
              </label>
              <select
                id="feed-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-colors"
              >
                {FEED_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="feed-pillar"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Strategic Pillar
              </label>
              <select
                id="feed-pillar"
                value={pillarId}
                onChange={(e) => setPillarId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-colors"
              >
                {PILLARS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="feed-interval"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Check Interval (hours)
            </label>
            <input
              id="feed-interval"
              type="number"
              min={1}
              max={168}
              value={checkInterval}
              onChange={(e) =>
                setCheckInterval(parseInt(e.target.value, 10) || 6)
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-surface-elevated text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-colors"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              How often this feed should be checked for new articles (1-168
              hours)
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <LoadingButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </LoadingButton>
            <LoadingButton
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              loadingText={isEditing ? "Saving..." : "Adding..."}
            >
              {isEditing ? "Save Changes" : "Add Feed"}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
