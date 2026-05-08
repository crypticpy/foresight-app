/**
 * CspHeatmap — pillar × goal coverage as horizontal bar rows.
 *
 * Each pillar gets a header row (color stripe + code + name + total card
 * count), then a stacked list of goal rows. Every goal row shows
 * `code · name · bar · count`, where the bar is sqrt-scaled against the
 * global max so a 200-card goal saturates while a 5-card goal still reads.
 *
 * The horizontal-bar form fixes the ragged whitespace the pill grid had:
 * every row spans the full block width regardless of how many goals a
 * pillar has, and the pillar's signature color carries through every bar.
 */

import { useMemo } from "react";
import { cn } from "../../lib/utils";
import type { CspGoalCoverage } from "../../types/dashboard";
import type { PillarCode } from "../../lib/lens-api";

export interface CspHeatmapProps {
  data: CspGoalCoverage[];
  className?: string;
  /** Click handler for a goal row. */
  onGoalClick?: (goal: CspGoalCoverage) => void;
}

const PILLAR_ORDER: PillarCode[] = ["CH", "EW", "HG", "HH", "MC", "PS"];

const PILLAR_NAMES: Record<PillarCode, string> = {
  CH: "Community Health",
  EW: "Economic & Workforce",
  HG: "High-Performing Gov",
  HH: "Homelessness & Housing",
  MC: "Mobility & Infra",
  PS: "Public Safety",
};

interface PillarPalette {
  /** Solid hex used for the header stripe and bar fill. */
  accent: string;
  /** Tailwind text class for the pillar code (header). */
  label: string;
  /** Tailwind background for the empty bar track. */
  track: string;
}

const PILLAR_PALETTE: Record<PillarCode, PillarPalette> = {
  CH: {
    accent: "#059669",
    label: "text-emerald-700 dark:text-emerald-300",
    track: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  EW: {
    accent: "#0284C7",
    label: "text-sky-700 dark:text-sky-300",
    track: "bg-sky-50 dark:bg-sky-900/20",
  },
  HG: {
    accent: "#4F46E5",
    label: "text-indigo-700 dark:text-indigo-300",
    track: "bg-indigo-50 dark:bg-indigo-900/20",
  },
  HH: {
    accent: "#DB2777",
    label: "text-pink-700 dark:text-pink-300",
    track: "bg-pink-50 dark:bg-pink-900/20",
  },
  MC: {
    accent: "#D97706",
    label: "text-amber-700 dark:text-amber-300",
    track: "bg-amber-50 dark:bg-amber-900/20",
  },
  PS: {
    accent: "#E11D48",
    label: "text-rose-700 dark:text-rose-300",
    track: "bg-rose-50 dark:bg-rose-900/20",
  },
};

interface PillarRow {
  pillar: PillarCode;
  pillarName: string;
  goals: CspGoalCoverage[];
}

function groupByPillar(data: CspGoalCoverage[]): PillarRow[] {
  const buckets = new Map<PillarCode, CspGoalCoverage[]>();
  for (const code of PILLAR_ORDER) buckets.set(code, []);
  for (const goal of data) {
    const code = goal.pillar_code as PillarCode;
    if (buckets.has(code)) {
      buckets.get(code)!.push(goal);
    }
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code));
  }
  return PILLAR_ORDER.map((p) => ({
    pillar: p,
    pillarName: PILLAR_NAMES[p],
    goals: buckets.get(p) ?? [],
  }));
}

/** sqrt scale: 1-card goal still reads, 200-card goal still saturates. */
function barWidthPct(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(100, Math.sqrt(count / max) * 100);
}

export function CspHeatmap({ data, className, onGoalClick }: CspHeatmapProps) {
  const rows = useMemo(() => groupByPillar(data), [data]);
  const max = useMemo(
    () => data.reduce((m, g) => (g.card_count > m ? g.card_count : m), 0),
    [data],
  );

  return (
    <div
      className={cn("flex flex-col gap-4", className)}
      role="table"
      aria-label="CSP goal coverage by pillar"
    >
      {rows.map((row) => {
        const palette = PILLAR_PALETTE[row.pillar];
        return (
          <div key={row.pillar} role="rowgroup" className="flex flex-col gap-1">
            {/* Pillar header */}
            <div className="flex items-center gap-2 mb-0.5">
              <span
                aria-hidden="true"
                className="block w-1 h-5 rounded-full flex-shrink-0"
                style={{ backgroundColor: palette.accent }}
              />
              <span
                className={cn("text-sm font-bold tabular-nums", palette.label)}
              >
                {row.pillar}
              </span>
              <span className="text-xs text-gray-700 dark:text-gray-300">
                {row.pillarName}
              </span>
            </div>

            {/* Goal rows */}
            <div className="flex flex-col gap-0.5">
              {row.goals.map((goal) => {
                const interactive = !!onGoalClick;
                const Tag: "button" | "div" = interactive ? "button" : "div";
                const width = barWidthPct(goal.card_count, max);
                const isEmpty = goal.card_count === 0;
                return (
                  <Tag
                    key={goal.goal_id}
                    type={interactive ? "button" : undefined}
                    onClick={interactive ? () => onGoalClick!(goal) : undefined}
                    role="row"
                    className={cn(
                      "grid items-center gap-2 py-1 pr-1 rounded-md text-left",
                      "transition-colors duration-200",
                      interactive
                        ? "hover:bg-gray-50 dark:hover:bg-dark-surface-hover/40 cursor-pointer"
                        : "cursor-default",
                    )}
                    style={{
                      gridTemplateColumns:
                        "auto minmax(0, 1fr) minmax(0, 2.5fr) auto",
                    }}
                    title={`${goal.code} — ${goal.name} · ${goal.card_count} card${goal.card_count === 1 ? "" : "s"}`}
                    aria-label={`${goal.code} ${goal.name}, ${goal.card_count} cards`}
                  >
                    {/* Code */}
                    <span
                      className={cn(
                        "text-[10px] font-mono tabular-nums w-10 pl-2",
                        isEmpty
                          ? "text-gray-400 dark:text-gray-500"
                          : "text-gray-500 dark:text-gray-400",
                      )}
                    >
                      {goal.code}
                    </span>

                    {/* Name */}
                    <span
                      className={cn(
                        "text-xs truncate",
                        isEmpty
                          ? "text-gray-400 dark:text-gray-500"
                          : "text-gray-700 dark:text-gray-200",
                      )}
                    >
                      {goal.name}
                    </span>

                    {/* Bar track + fill */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2 rounded-full overflow-hidden",
                        isEmpty
                          ? "bg-gray-100 dark:bg-dark-surface-deep"
                          : palette.track,
                      )}
                    >
                      {!isEmpty && (
                        <span
                          className="block h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${width.toFixed(2)}%`,
                            backgroundColor: palette.accent,
                          }}
                        />
                      )}
                    </span>

                    {/* Count */}
                    <span
                      className={cn(
                        "text-xs font-semibold tabular-nums w-10 text-right pr-1",
                        isEmpty
                          ? "text-gray-400 dark:text-gray-500"
                          : "text-gray-900 dark:text-white",
                      )}
                    >
                      {goal.card_count}
                    </span>
                  </Tag>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CspHeatmap;
