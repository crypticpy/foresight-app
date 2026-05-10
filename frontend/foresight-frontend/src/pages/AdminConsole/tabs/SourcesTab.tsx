/**
 * Sources tab — catalog of discovery feeds + per-source health (last 7d).
 * v1 only RSS is read by the discovery pipeline; other categories show
 * a "Display only" badge until their fetcher is wired up.
 *
 * @module pages/AdminConsole/tabs/SourcesTab
 */

import React, { useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import {
  type AdminSource,
  type AdminSourceCreateBody,
  type AdminSourceUpdateBody,
  type SourceCategory,
} from "../../../lib/admin-api";
import { cn } from "../../../lib/utils";
import { formatDate, SectionHeader } from "../helpers";

const CATEGORY_LABELS: Record<SourceCategory, string> = {
  rss: "RSS / Atom feeds",
  news: "News outlets",
  academic: "Academic / arXiv",
  government: "Government (.gov)",
  tech_blog: "Tech blogs",
  web_search: "Web search templates",
};

// Categories whose fetcher actually reads from the registry today. Other
// categories display the rows but the pipeline still uses its hardcoded
// query lists (PR A2 will wire them up).
const LIVE_CATEGORIES: SourceCategory[] = ["rss"];

export function SourcesTab({
  sources,
  loading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}: {
  sources: AdminSource[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onCreate: (body: AdminSourceCreateBody) => Promise<void>;
  onUpdate: (id: string, patch: AdminSourceUpdateBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);

  const groups = useMemo(() => {
    const buckets: Record<SourceCategory, AdminSource[]> = {
      rss: [],
      news: [],
      academic: [],
      government: [],
      tech_blog: [],
      web_search: [],
    };
    for (const source of sources) {
      buckets[source.category].push(source);
    }
    return buckets;
  }, [sources]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SectionHeader
          title="Discovery sources"
          description="The catalog of feeds and queries the pipeline scans. Toggle, weight, and edit any row; the next discovery run picks up the change."
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-dark-surface dark:text-gray-200"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue/90"
          >
            <Plus className="h-4 w-4" />
            Add RSS source
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {(Object.keys(CATEGORY_LABELS) as SourceCategory[]).map((category) => {
          const items = groups[category];
          if (items.length === 0 && !LIVE_CATEGORIES.includes(category)) {
            return null;
          }
          const live = LIVE_CATEGORIES.includes(category);
          return (
            <SourceCategoryGroup
              key={category}
              category={category}
              live={live}
              items={items}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          );
        })}
      </div>

      {showAdd && (
        <AddSourceModal
          onClose={() => setShowAdd(false)}
          onCreate={async (body) => {
            await onCreate(body);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function SourceCategoryGroup({
  category,
  live,
  items,
  onUpdate,
  onDelete,
}: {
  category: SourceCategory;
  live: boolean;
  items: AdminSource[];
  onUpdate: (id: string, patch: AdminSourceUpdateBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {CATEGORY_LABELS[category]}
          </h3>
          {live ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              Live
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Display only
            </span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {items.length} {items.length === 1 ? "source" : "sources"}
          </span>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
          No sources registered for this category.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-dark-surface-deep/40 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">URL</th>
                <th className="px-4 py-2 text-center">Enabled</th>
                <th className="px-4 py-2 text-right">Weight</th>
                <th className="px-4 py-2 text-right">Items 7d</th>
                <th className="px-4 py-2 text-right">Accept rate</th>
                <th className="px-4 py-2 text-right">Last seen</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SourceRow({
  source,
  onUpdate,
  onDelete,
}: {
  source: AdminSource;
  onUpdate: (id: string, patch: AdminSourceUpdateBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [weightDraft, setWeightDraft] = useState(String(source.weight));

  const acceptRate =
    source.accept_rate_7d !== null
      ? `${Math.round(source.accept_rate_7d * 100)}%`
      : "—";

  const handleToggle = async () => {
    setPending(true);
    try {
      await onUpdate(source.id, { enabled: !source.enabled });
    } finally {
      setPending(false);
    }
  };

  const handleWeightCommit = async () => {
    const next = Number(weightDraft);
    if (Number.isNaN(next) || next < 0 || next > 10) {
      setWeightDraft(String(source.weight));
      return;
    }
    if (next === source.weight) return;
    setPending(true);
    try {
      await onUpdate(source.id, { weight: next });
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete source "${source.name}"? This cannot be undone — the next discovery run will skip it.`,
      )
    ) {
      return;
    }
    setPending(true);
    try {
      await onDelete(source.id);
    } finally {
      setPending(false);
    }
  };

  return (
    <tr
      className={cn(
        "text-sm",
        !source.enabled && "opacity-60",
        pending && "animate-pulse",
      )}
    >
      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
        {source.name}
        {source.notes && (
          <div className="text-xs font-normal text-gray-500 dark:text-gray-400">
            {source.notes}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-brand-blue hover:underline"
          >
            {source.url}
          </a>
        ) : (
          <span className="text-xs italic text-gray-500">(query template)</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          className={cn(
            "inline-flex h-5 w-9 items-center rounded-full transition-colors",
            source.enabled ? "bg-brand-blue" : "bg-gray-300 dark:bg-gray-600",
            pending && "opacity-60",
          )}
          aria-pressed={source.enabled}
          aria-label={source.enabled ? "Disable source" : "Enable source"}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              source.enabled ? "translate-x-4" : "translate-x-1",
            )}
          />
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <input
          type="number"
          min={0}
          max={10}
          step={0.1}
          value={weightDraft}
          onChange={(e) => setWeightDraft(e.target.value)}
          onBlur={handleWeightCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          disabled={pending}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
        />
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
        {source.items_7d}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
        {acceptRate}
      </td>
      <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">
        {formatDate(source.last_discovered_at) || "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
          title="Delete source"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function AddSourceModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (body: AdminSourceCreateBody) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorText(null);
    try {
      await onCreate({
        category: "rss",
        name: name.trim(),
        url: url.trim(),
        notes: notes.trim() || null,
      });
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Failed to add source");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-dark-surface">
        <form onSubmit={handleSubmit}>
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Add RSS source
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              The URL is validated with a HEAD request before being added.
            </p>
          </div>
          <div className="space-y-4 px-5 py-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Display name
              </span>
              <input
                type="text"
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Feed URL
              </span>
              <input
                type="url"
                value={url}
                required
                placeholder="https://example.com/feed"
                onChange={(e) => setUrl(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Notes (optional)
              </span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
              />
            </label>
            {errorText && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {errorText}
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add source
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
