/**
 * WhatChangedStrip — compact horizontal "what's new in 24h" indicator.
 *
 * Reads `delta_24h` from the lens-overview response and surfaces only
 * non-zero items as chips. When everything is zero, shows a subtle
 * "Quiet last 24 hours" caption so the strip's vertical space doesn't
 * disappear from one render to the next.
 *
 * Each chip links to the relevant destination so the user can act on it.
 */

import { Link } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  Star,
  ArrowUpRight,
  Layers,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { LensDelta24h } from "../../types/dashboard";

export interface WhatChangedStripProps {
  delta: LensDelta24h | null;
  className?: string;
}

interface ChipSpec {
  count: number;
  label: string;
  href: string;
  Icon: typeof Activity;
  accent: string;
}

function buildChips(delta: LensDelta24h): ChipSpec[] {
  return [
    {
      count: delta.new_cards,
      label: delta.new_cards === 1 ? "new card" : "new cards",
      href: "/discover?filter=new",
      Icon: Activity,
      accent: "text-brand-blue",
    },
    {
      count: delta.new_classifications,
      label:
        delta.new_classifications === 1
          ? "newly classified"
          : "newly classified",
      href: "/discover",
      Icon: CheckCircle2,
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      count: delta.new_follows,
      label: delta.new_follows === 1 ? "new follow" : "new follows",
      href: "/discover?filter=following",
      Icon: Star,
      accent: "text-amber-500",
    },
    {
      count: delta.new_workstream_cards,
      label:
        delta.new_workstream_cards === 1
          ? "added to a workstream"
          : "added to workstreams",
      href: "/workstreams",
      Icon: Layers,
      accent: "text-extended-purple",
    },
  ];
}

export function WhatChangedStrip({ delta, className }: WhatChangedStripProps) {
  if (!delta) return null;

  const chips = buildChips(delta).filter((c) => c.count > 0);
  const isQuiet = chips.length === 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 flex-wrap",
        "rounded-xl border border-gray-200 dark:border-gray-700/60",
        "bg-white/60 dark:bg-dark-surface/60 backdrop-blur-sm",
        "px-4 py-2.5",
        className,
      )}
      role="region"
      aria-label="What changed in the last 24 hours"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Last 24h
      </span>

      {isQuiet ? (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Quiet — nothing new since yesterday.
        </span>
      ) : (
        chips.map(({ count, label, href, Icon, accent }) => (
          <Link
            key={label}
            to={href}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm",
              "text-gray-700 dark:text-gray-200",
              "hover:text-brand-blue dark:hover:text-white",
              "transition-colors duration-200 group",
            )}
          >
            <Icon className={cn("h-4 w-4 flex-shrink-0", accent)} />
            <span className="font-semibold tabular-nums">+{count}</span>
            <span>{label}</span>
            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))
      )}
    </div>
  );
}

export default WhatChangedStrip;
