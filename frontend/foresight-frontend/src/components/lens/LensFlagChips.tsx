/**
 * LensFlagChips — compact at-a-glance row of operational-lens chips.
 *
 * Renders only when a card has lens metadata worth surfacing:
 *   - Budget chip when budget_assessment.relevance >= threshold
 *   - Climate chip when climate_assessment.relevance >= threshold
 *   - Up to `maxIssueTags` issue_tags as small pills
 *
 * Used on DiscoverCard and Dashboard "Recent Intelligence" rows so the
 * lens data we already store on the card surfaces in the grid views,
 * not just the detail panel.
 */

import { Landmark, Cloud, Tag } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { cn } from "../../lib/utils";

export interface LensFlagChipsProps {
  budgetAssessment?: { relevance?: number } | Record<string, unknown> | null;
  climateAssessment?: { relevance?: number } | Record<string, unknown> | null;
  issueTags?: string[] | null;
  /** Minimum relevance score to show a budget/climate chip (default 60). */
  threshold?: number;
  /** Max issue tags to render before truncating to "+N more". */
  maxIssueTags?: number;
  className?: string;
}

function readRelevance(
  source?: { relevance?: number } | Record<string, unknown> | null,
): number | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>).relevance;
  return typeof value === "number" ? value : null;
}

export function LensFlagChips({
  budgetAssessment,
  climateAssessment,
  issueTags,
  threshold = 60,
  maxIssueTags = 2,
  className,
}: LensFlagChipsProps) {
  const budgetRelevance = readRelevance(budgetAssessment);
  const climateRelevance = readRelevance(climateAssessment);
  const showBudget = budgetRelevance !== null && budgetRelevance >= threshold;
  const showClimate =
    climateRelevance !== null && climateRelevance >= threshold;

  const tags = (issueTags ?? []).filter(Boolean);
  const visibleTags = tags.slice(0, maxIssueTags);
  const hiddenCount = tags.length - visibleTags.length;

  if (!showBudget && !showClimate && visibleTags.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {showBudget && (
        <Tooltip
          content={`Budget-relevant — assessment ${Math.round(budgetRelevance!)}/100`}
          side="top"
          align="center"
        >
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 cursor-default"
            role="status"
            aria-label="Budget relevant"
          >
            <Landmark className="h-2.5 w-2.5" />
            Budget
          </span>
        </Tooltip>
      )}
      {showClimate && (
        <Tooltip
          content={`Climate-relevant — assessment ${Math.round(climateRelevance!)}/100`}
          side="top"
          align="center"
        >
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700 cursor-default"
            role="status"
            aria-label="Climate relevant"
          >
            <Cloud className="h-2.5 w-2.5" />
            Climate
          </span>
        </Tooltip>
      )}
      {visibleTags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700"
          title={`Issue: ${tag}`}
        >
          <Tag className="h-2.5 w-2.5" />
          {tag}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700"
          title={tags.slice(maxIssueTags).join(", ")}
        >
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}

export default LensFlagChips;
