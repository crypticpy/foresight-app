/**
 * IssueTagCloud — chip cloud of the dashboard's top issue tags.
 *
 * Tags come from the lens-overview backend pre-sorted descending by count
 * and pre-bounded (top 12). Font size scales sqrt-by-count so a ×10 tag
 * doesn't dwarf a ×1 tag visually but still reads as larger.
 *
 * Renders an "All issues" link that takes the user into Discover with a
 * tag filter; if the cloud is empty it shows a quiet caption instead.
 */

import { Link } from "react-router-dom";
import { Tag } from "lucide-react";
import { cn } from "../../lib/utils";
import type { IssueTagCount } from "../../types/dashboard";

export interface IssueTagCloudProps {
  data: IssueTagCount[];
  className?: string;
}

const MIN_REM = 0.75; // tw text-xs
const MAX_REM = 1.05; // ~text-base

function humanizeTag(tag: string): string {
  return tag
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fontSizeRem(count: number, max: number): number {
  if (max <= 0) return MIN_REM;
  const ratio = Math.sqrt(count / max);
  return MIN_REM + (MAX_REM - MIN_REM) * ratio;
}

export function IssueTagCloud({ data, className }: IssueTagCloudProps) {
  const max = data.reduce((m, t) => (t.count > m ? t.count : m), 0);

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400",
          className,
        )}
      >
        <Tag className="h-4 w-4" />
        <span>No issue tags assigned yet.</span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-2", className)}
    >
      {data.map((tag) => (
        <Link
          key={tag.tag}
          to={`/discover?issue_tag=${encodeURIComponent(tag.tag)}`}
          className={cn(
            "inline-flex items-baseline gap-1.5",
            "text-gray-700 dark:text-gray-200",
            "hover:text-brand-blue dark:hover:text-white",
            "transition-colors duration-200",
          )}
          style={{ fontSize: `${fontSizeRem(tag.count, max).toFixed(3)}rem` }}
          title={`${humanizeTag(tag.tag)} · ${tag.count} card${tag.count === 1 ? "" : "s"}`}
        >
          <span className="font-medium">{humanizeTag(tag.tag)}</span>
          <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
            {tag.count}
          </span>
        </Link>
      ))}
    </div>
  );
}

export default IssueTagCloud;
