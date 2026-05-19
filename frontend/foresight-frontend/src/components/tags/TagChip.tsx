import React from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "../../lib/utils";
import type { TagOnCard } from "../../lib/tags-api";

export interface TagChipProps {
  tag: TagOnCard;
  /** Increment count by also-applying the same tag. */
  onCoApply?: (tag: TagOnCard) => void;
  /** Remove the viewer's own application of this tag. */
  onRemove?: (tag: TagOnCard) => void;
  /** Hide the +/x affordance entirely (read-only). */
  readOnly?: boolean;
  /** Hide the count badge (compact display). */
  hideCount?: boolean;
  /** Optional click handler for navigation (tag detail page). */
  onClick?: (tag: TagOnCard) => void;
  className?: string;
}

export const TagChip: React.FC<TagChipProps> = ({
  tag,
  onCoApply,
  onRemove,
  readOnly = false,
  hideCount = false,
  onClick,
  className,
}) => {
  const appliedByMe = tag.applied_by_me;

  const handleToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (appliedByMe) {
      onRemove?.(tag);
    } else {
      onCoApply?.(tag);
    }
  };

  const handleLabelClick = () => {
    onClick?.(tag);
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors duration-200",
        appliedByMe
          ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue dark:border-brand-blue/60 dark:bg-brand-blue/20 dark:text-blue-200"
          : "border-gray-300 bg-gray-100 text-gray-700 dark:border-dark-surface-hover dark:bg-dark-surface-elevated dark:text-gray-200",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleLabelClick}
        disabled={!onClick}
        className={cn(
          "truncate max-w-[140px]",
          onClick && "hover:underline cursor-pointer",
          !onClick && "cursor-default",
        )}
        title={tag.label}
      >
        {tag.label}
      </button>
      {!hideCount && tag.count > 1 && (
        <span
          className="rounded-full bg-white/60 px-1 text-[10px] tabular-nums text-gray-600 dark:bg-dark-surface-deep dark:text-gray-300"
          aria-label={`${tag.count} users applied this tag`}
        >
          {tag.count}
        </span>
      )}
      {!readOnly && (onCoApply || onRemove) && (
        <button
          type="button"
          onClick={handleToggle}
          aria-label={
            appliedByMe
              ? `Remove tag ${tag.label}`
              : `Also apply tag ${tag.label}`
          }
          className={cn(
            "ml-0.5 flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-200",
            appliedByMe
              ? "text-brand-blue hover:bg-brand-blue/20 dark:text-blue-200"
              : "text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-dark-surface-hover",
          )}
        >
          {appliedByMe ? (
            <Check className="h-3 w-3" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
        </button>
      )}
      {!readOnly && appliedByMe && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          aria-label={`Remove tag ${tag.label}`}
          className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-brand-blue/70 hover:bg-brand-blue/20 hover:text-brand-blue dark:text-blue-200/70"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
};
