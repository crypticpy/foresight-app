import React from "react";
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
 * (label only, no count) followed by a "+N" overflow pill, or a single
 * icon-plus-count pill when the list view doesn't have room for chips.
 *
 * Stays passive — no apply/remove affordances at the tile level. Clicking
 * is a no-op until PR 5 wires tag-detail navigation.
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
      className={cn("flex flex-wrap items-center gap-1", className)}
      aria-label={`Tags: ${tags.map((t) => t.label).join(", ")}`}
    >
      <TagIcon className="h-3 w-3 text-gray-400 dark:text-gray-500" />
      {visible.map((tag) => (
        <span
          key={tag.id}
          title={tag.label}
          className={cn(
            "max-w-[120px] truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
            tag.applied_by_me
              ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue dark:border-brand-blue/60 dark:bg-brand-blue/20 dark:text-blue-200"
              : "border-gray-200 bg-gray-100 text-gray-600 dark:border-dark-surface-hover dark:bg-dark-surface-elevated dark:text-gray-300",
          )}
        >
          {tag.label}
        </span>
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
