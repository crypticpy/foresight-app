/**
 * FlagsRow — operational-dimension counters (budget + climate).
 *
 * Reads the two flag counts from lens-overview and renders them as a
 * pair of clickable tiles. "Flag" here means a card whose
 * budget_assessment.relevance or climate_assessment.relevance is ≥ 60.
 *
 * Each tile fills its right side with a thin ratio bar (flagged / total
 * active cards) so the dead-space after the count carries a visual
 * proportion, not just emptiness.
 */

import { Link } from "react-router-dom";
import { Landmark, Cloud } from "lucide-react";
import { cn } from "../../lib/utils";

export interface FlagsRowProps {
  budgetFlagCount: number;
  climateFlagCount: number;
  /** Total active cards — used to render the share-of-corpus bar. */
  totalActiveCards?: number;
  className?: string;
}

interface FlagSpec {
  label: string;
  count: number;
  href: string;
  Icon: typeof Landmark;
  accentText: string;
  accentBg: string;
  barFill: string;
  barTrack: string;
  caption: string;
}

export function FlagsRow({
  budgetFlagCount,
  climateFlagCount,
  totalActiveCards,
  className,
}: FlagsRowProps) {
  const flags: FlagSpec[] = [
    {
      label: "Budget-relevant",
      count: budgetFlagCount,
      href: "/discover?flag=budget",
      Icon: Landmark,
      accentText: "text-emerald-600 dark:text-emerald-400",
      accentBg: "bg-emerald-50 dark:bg-emerald-900/20",
      barFill: "bg-emerald-500/80 dark:bg-emerald-400/80",
      barTrack: "bg-emerald-100/70 dark:bg-emerald-900/30",
      caption: "cards with budget assessment ≥ 60",
    },
    {
      label: "Climate-relevant",
      count: climateFlagCount,
      href: "/discover?flag=climate",
      Icon: Cloud,
      accentText: "text-sky-600 dark:text-sky-400",
      accentBg: "bg-sky-50 dark:bg-sky-900/20",
      barFill: "bg-sky-500/80 dark:bg-sky-400/80",
      barTrack: "bg-sky-100/70 dark:bg-sky-900/30",
      caption: "cards with climate assessment ≥ 60",
    },
  ];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {flags.map((flag) => {
        const ratio =
          totalActiveCards && totalActiveCards > 0
            ? Math.min(1, flag.count / totalActiveCards)
            : 0;
        const pct = Math.round(ratio * 100);
        return (
          <Link
            key={flag.label}
            to={flag.href}
            title={`${flag.caption}${totalActiveCards ? ` · ${flag.count} of ${totalActiveCards} (${pct}%)` : ""}`}
            className={cn(
              "rounded-lg border border-gray-200 dark:border-gray-700/60",
              "bg-white dark:bg-dark-surface px-3 py-2",
              "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
              "group flex items-center gap-3",
            )}
          >
            <span
              className={cn(
                "flex-shrink-0 p-1.5 rounded-md",
                flag.accentBg,
                flag.accentText,
              )}
            >
              <flag.Icon className="h-4 w-4" />
            </span>
            <div className="flex-shrink-0 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
                {flag.label}
              </p>
              <p className="text-lg font-semibold tabular-nums leading-tight text-gray-900 dark:text-white">
                {flag.count}
              </p>
            </div>
            {totalActiveCards && totalActiveCards > 0 ? (
              <div className="ml-auto flex flex-col items-end gap-1 min-w-0 flex-1 max-w-[160px]">
                <span className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                  {pct}% of {totalActiveCards}
                </span>
                <span
                  className={cn(
                    "block w-full h-1.5 rounded-full overflow-hidden",
                    flag.barTrack,
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      "block h-full rounded-full transition-all duration-300",
                      flag.barFill,
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </div>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export default FlagsRow;
