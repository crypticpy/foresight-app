/**
 * FlagsRow — operational-dimension counters (budget + climate).
 *
 * Reads the two flag counts from lens-overview and renders them as a
 * pair of clickable tiles. "Flag" here means a card whose
 * budget_assessment.relevance or climate_assessment.relevance is ≥ 60.
 */

import { Link } from "react-router-dom";
import { DollarSign, Cloud } from "lucide-react";
import { cn } from "../../lib/utils";

export interface FlagsRowProps {
  budgetFlagCount: number;
  climateFlagCount: number;
  className?: string;
}

interface FlagSpec {
  label: string;
  count: number;
  href: string;
  Icon: typeof DollarSign;
  accentText: string;
  accentBg: string;
  caption: string;
}

export function FlagsRow({
  budgetFlagCount,
  climateFlagCount,
  className,
}: FlagsRowProps) {
  const flags: FlagSpec[] = [
    {
      label: "Budget-relevant",
      count: budgetFlagCount,
      href: "/discover?flag=budget",
      Icon: DollarSign,
      accentText: "text-emerald-600 dark:text-emerald-400",
      accentBg: "bg-emerald-50 dark:bg-emerald-900/20",
      caption: "cards with budget assessment ≥ 60",
    },
    {
      label: "Climate-relevant",
      count: climateFlagCount,
      href: "/discover?flag=climate",
      Icon: Cloud,
      accentText: "text-sky-600 dark:text-sky-400",
      accentBg: "bg-sky-50 dark:bg-sky-900/20",
      caption: "cards with climate assessment ≥ 60",
    },
  ];

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", className)}>
      {flags.map((flag) => (
        <Link
          key={flag.label}
          to={flag.href}
          className={cn(
            "rounded-xl border border-gray-200 dark:border-gray-700/60",
            "bg-white dark:bg-dark-surface p-4",
            "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
            "group",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex-shrink-0 p-2 rounded-lg",
                flag.accentBg,
                flag.accentText,
              )}
            >
              <flag.Icon className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {flag.label}
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
                {flag.count}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {flag.caption}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default FlagsRow;
