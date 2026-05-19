import React from "react";
import { Link } from "react-router-dom";
import { Tag as TagIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { TAG_MINI_DISPLAY_LIMIT, type TagOnCard } from "../../lib/tags-api";

export interface MiniTagBadgeProps {
  tags: TagOnCard[];
  /** Cap visible chips; remainder rolls into a "+N" pill. */
  limit?: number;
  className?: string;
}

/**
 * Compact tag display for a card tile. Renders up to `limit` chip pills
 * (label only, no count) followed by a "+N" overflow pill.
 *
 * Each chip links to the tag detail page (`/tags/{slug}`). When this
 * component is rendered inside a card tile that uses the card-link
 * pattern (e.g. `SignalCard`), the parent must lift the chip row above
 * the card's overlay link — wrap with `relative z-10`. The chip
 * `onClick` also calls `stopPropagation` so a chip-on-card-link click
 * doesn't bubble back to a host that also navigates.
 */
export const MiniTagBadge: React.FC<MiniTagBadgeProps> = ({
  tags,
  limit = TAG_MINI_DISPLAY_LIMIT,
  className,
}) => {
  if (!tags || tags.length === 0) return null;

  const visible = tags.slice(0, limit);
  const overflow = Math.max(0, tags.length - visible.length);

  return (
    <div
      role="group"
      className={cn("flex flex-wrap items-center gap-1", className)}
      aria-label={`Tags: ${tags.map((t) => t.label).join(", ")}`}
    >
      <TagIcon className="h-3 w-3 text-gray-400 dark:text-gray-500" />
      {visible.map((tag) => (
        <Link
          key={tag.id}
          to={`/tags/${encodeURIComponent(tag.slug)}`}
          onClick={(e) => e.stopPropagation()}
          title={tag.label}
          className={cn(
            "max-w-[120px] truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-200 hover:underline",
            tag.applied_by_me
              ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue dark:border-brand-blue/60 dark:bg-brand-blue/20 dark:text-blue-200"
              : "border-gray-200 bg-gray-100 text-gray-600 hover:text-brand-blue dark:border-dark-surface-hover dark:bg-dark-surface-elevated dark:text-gray-300 dark:hover:text-blue-200",
          )}
        >
          {tag.label}
        </Link>
      ))}
      {overflow > 0 && (
        <span
          className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 tabular-nums dark:bg-dark-surface-hover dark:text-gray-300"
          aria-label={`${overflow} more tags`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
};
