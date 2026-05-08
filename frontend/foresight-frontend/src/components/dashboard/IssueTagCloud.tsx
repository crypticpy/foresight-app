/**
 * IssueTagCloud — proper word cloud of the dashboard's top issue tags.
 *
 * Tags arrive pre-sorted descending by count and pre-bounded (top 12).
 * Font size and color saturation both scale sqrt-by-count so the heaviest
 * tags read visually as the heaviest. Where an issue tag maps cleanly to a
 * Strategic Pillar, we tint the link in that pillar's color; cross-pillar
 * tags fall back to a neutral foreground.
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
const MAX_REM = 1.5; // emphatic — heaviest tag dominates

/**
 * Map closed-vocabulary issue tags (see `_ISSUE_TAGS_PROMPT` in the lens
 * classifier) to the Strategic Pillar they best line up with. Cross-cutting
 * tags resolve to `XCUT` so they get a distinct brand-blue accent —
 * leaving size to dictate visual weight rather than mapping to gray.
 */
const TAG_TO_PILLAR: Record<string, string> = {
  cost_of_living: "EW",
  behavioral_health_homelessness: "HH",
  youth_family_needs: "CH",
  equity_expectations: "XCUT",
  climate_change: "CH",
  aging_infrastructure: "MC",
  energy_transition: "MC",
  housing_landuse_pressure: "HH",
  state_federal_preemption: "HG",
  regional_interdependence: "HG",
  grant_funding: "HG",
  civic_trust: "HG",
  economic_competitiveness: "EW",
};

const PILLAR_TONE: Record<string, string> = {
  CH: "text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200",
  EW: "text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200",
  HG: "text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200",
  HH: "text-pink-700 dark:text-pink-300 hover:text-pink-800 dark:hover:text-pink-200",
  MC: "text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200",
  PS: "text-rose-700 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200",
  // Cross-cutting tags (e.g. equity_expectations) — distinct brand accent.
  XCUT: "text-brand-blue dark:text-brand-light-blue hover:text-brand-dark-blue dark:hover:text-white",
};

const NEUTRAL_TONE =
  "text-gray-700 dark:text-gray-200 hover:text-brand-blue dark:hover:text-white";

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

function toneFor(tag: string): string {
  const pillar = TAG_TO_PILLAR[tag];
  if (pillar && PILLAR_TONE[pillar]) return PILLAR_TONE[pillar];
  return NEUTRAL_TONE;
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
      className={cn(
        "flex flex-wrap items-baseline gap-x-3 gap-y-1.5 leading-snug",
        className,
      )}
    >
      {data.map((tag) => (
        <Link
          key={tag.tag}
          to={`/discover?issue_tag=${encodeURIComponent(tag.tag)}`}
          className={cn(
            "inline-flex items-baseline gap-1 transition-colors duration-200",
            toneFor(tag.tag),
          )}
          style={{ fontSize: `${fontSizeRem(tag.count, max).toFixed(3)}rem` }}
          title={`${humanizeTag(tag.tag)} · ${tag.count} card${tag.count === 1 ? "" : "s"}`}
        >
          <span className="font-semibold">{humanizeTag(tag.tag)}</span>
          <span className="text-[0.65em] tabular-nums opacity-60">
            {tag.count}
          </span>
        </Link>
      ))}
    </div>
  );
}

export default IssueTagCloud;
