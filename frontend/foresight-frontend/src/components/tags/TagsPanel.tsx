import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Tag as TagIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { useCardTags } from "../../hooks/useCardTags";
import { TAG_DISPLAY_LIMIT, type TagOnCard } from "../../lib/tags-api";
import { TagChip } from "./TagChip";
import { TagEditor } from "./TagEditor";

export interface TagsPanelProps {
  cardId: string;
  getAuthToken: () => Promise<string | null>;
  /** Hide editor/affordances; used by share-link/read-only views. */
  readOnly?: boolean;
  /** Optional default workstream scope to attribute new applications to. */
  workstreamId?: string;
  className?: string;
}

export const TagsPanel: React.FC<TagsPanelProps> = ({
  cardId,
  getAuthToken,
  readOnly = false,
  workstreamId,
  className,
}) => {
  const { tags, loading, saving, error, apply, remove } = useCardTags(
    cardId,
    getAuthToken,
  );
  const [showAll, setShowAll] = useState(false);

  // Collapse the "show all" expansion when the card context changes so the
  // next opened card doesn't inherit the previous card's expanded state.
  useEffect(() => {
    setShowAll(false);
  }, [cardId]);

  const { visible, overflow } = useMemo(() => {
    if (showAll || tags.length <= TAG_DISPLAY_LIMIT) {
      return { visible: tags, overflow: 0 };
    }
    return {
      visible: tags.slice(0, TAG_DISPLAY_LIMIT),
      overflow: tags.length - TAG_DISPLAY_LIMIT,
    };
  }, [tags, showAll]);

  const existingSlugs = useMemo(() => tags.map((t) => t.slug), [tags]);

  const handleCoApply = (tag: TagOnCard) => apply(tag.label, workstreamId);
  const handleRemove = (tag: TagOnCard) => remove(tag.slug);
  // Tag-detail navigation is gated on the /tags/:slug route landing in
  // PR 5 of this stack; until then chips render without a click handler
  // so we don't dead-link users to a 404.

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-dark-surface-hover dark:bg-dark-surface",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <TagIcon className="h-3.5 w-3.5" />
          <span>Tags</span>
          {tags.length > 0 && (
            <span className="text-gray-400 dark:text-gray-500">
              · {tags.length}
            </span>
          )}
        </div>
      </div>
      {loading && tags.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Loading…</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {visible.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              onCoApply={readOnly ? undefined : handleCoApply}
              onRemove={readOnly ? undefined : handleRemove}
              readOnly={readOnly}
            />
          ))}
          {overflow > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium text-gray-500 hover:text-brand-blue dark:text-gray-400"
              aria-label={`Show ${overflow} more tags`}
            >
              <ChevronRight className="h-3 w-3" />+{overflow}
            </button>
          )}
          {showAll && tags.length > TAG_DISPLAY_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium text-gray-500 hover:text-brand-blue dark:text-gray-400"
              aria-label="Show fewer tags"
            >
              <ChevronDown className="h-3 w-3" />
              less
            </button>
          )}
          {!readOnly && (
            <TagEditor
              getAuthToken={getAuthToken}
              onApply={(label) => apply(label, workstreamId)}
              existingSlugs={existingSlugs}
              disabled={saving}
            />
          )}
          {!readOnly && tags.length === 0 && !loading && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              No tags yet — be the first.
            </span>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};
