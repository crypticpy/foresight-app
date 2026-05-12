/**
 * CoverageGapHeatmap — pillar × goal coverage rows colored by drift_score.
 *
 * This is the admin-console variant of
 * ``components/dashboard/CspHeatmap``: instead of raw card counts driving
 * the bar width, the bar fills against a uniform-distribution baseline and
 * each row's color reflects how starved the goal is. Cells the backend
 * tagged ``priority: 'high'`` or ``'medium'`` get amber/red treatment so an
 * operator can scan the column and spot gaps without reading numbers.
 *
 * Read-only by design — the dispatch button arrives in PR-E.
 */

import { useMemo } from "react";
import type { CoverageGapCell } from "../../lib/admin-api";
import { cn } from "../../lib/utils";

export interface CoverageGapHeatmapProps {
  cells: CoverageGapCell[];
  expectedPerCell: number;
  className?: string;
}

const PILLAR_ORDER = ["CH", "EW", "HG", "HH", "MC", "PS"] as const;
type PillarCode = (typeof PILLAR_ORDER)[number];

const PILLAR_NAMES: Record<PillarCode, string> = {
  CH: "Community Health",
  EW: "Economic & Workforce",
  HG: "High-Performing Gov",
  HH: "Homelessness & Housing",
  MC: "Mobility & Infra",
  PS: "Public Safety",
};

// Drift-priority palette. Color is the bar fill; track is the empty rail
// behind it; ring is the row outline when a high-priority cell needs to
// stand out from neighbors. Kept in one map so tweaks stay coherent.
const PRIORITY_PALETTE: Record<
  CoverageGapCell["priority"],
  { fill: string; track: string; label: string; ring: string }
> = {
  high: {
    fill: "bg-rose-500 dark:bg-rose-500",
    track: "bg-rose-100 dark:bg-rose-900/30",
    label: "text-rose-700 dark:text-rose-300",
    ring: "ring-1 ring-rose-300/60 dark:ring-rose-500/30",
  },
  medium: {
    fill: "bg-amber-500 dark:bg-amber-500",
    track: "bg-amber-100 dark:bg-amber-900/30",
    label: "text-amber-700 dark:text-amber-300",
    ring: "",
  },
  none: {
    fill: "bg-emerald-500 dark:bg-emerald-500",
    track: "bg-gray-100 dark:bg-dark-surface-deep",
    label: "text-gray-500 dark:text-gray-400",
    ring: "",
  },
};

interface PillarBucket {
  pillar: PillarCode;
  pillarName: string;
  cells: CoverageGapCell[];
  totalCards: number;
}

function groupByPillar(cells: CoverageGapCell[]): PillarBucket[] {
  const byCode = new Map<PillarCode, CoverageGapCell[]>();
  for (const code of PILLAR_ORDER) byCode.set(code, []);
  for (const cell of cells) {
    const code = cell.pillar_code as PillarCode;
    if (byCode.has(code)) byCode.get(code)!.push(cell);
  }
  // Within a pillar, keep starvation-first ordering — already provided by
  // the backend, but a safety sort prevents accidental reordering by parent
  // memoizations.
  for (const list of byCode.values()) {
    list.sort((a, b) =>
      a.drift_score === b.drift_score
        ? a.goal_code.localeCompare(b.goal_code)
        : a.drift_score - b.drift_score,
    );
  }
  return PILLAR_ORDER.map((p) => {
    const pillarCells = byCode.get(p) ?? [];
    return {
      pillar: p,
      pillarName: PILLAR_NAMES[p],
      cells: pillarCells,
      totalCards: pillarCells.reduce((sum, c) => sum + c.cards_in_window, 0),
    };
  });
}

/**
 * Map coverage `(actual / expected)` ratio to a 0-100% bar width. Capped at
 * 200% of expected so a runaway outlier doesn't crush every other bar to a
 * sliver. Below expected, the bar fills proportionally; at or above, the
 * bar reads as "saturated."
 */
function barWidthPct(actual: number, expected: number): number {
  if (expected <= 0) return 0;
  const ratio = actual / expected;
  return Math.min(100, (ratio / 2) * 100);
}

export function CoverageGapHeatmap({
  cells,
  expectedPerCell,
  className,
}: CoverageGapHeatmapProps) {
  const rows = useMemo(() => groupByPillar(cells), [cells]);

  return (
    <div
      className={cn("flex flex-col gap-4", className)}
      role="table"
      aria-label="Coverage gaps by pillar and CSP goal"
    >
      {rows.map((row) => (
        <div key={row.pillar} role="rowgroup" className="flex flex-col gap-1">
          {/* Pillar header */}
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {row.pillar}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {row.pillarName}
              </span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {row.totalCards} card{row.totalCards === 1 ? "" : "s"} ·{" "}
              {row.cells.length} goal{row.cells.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Goal rows */}
          <div className="flex flex-col gap-0.5">
            {row.cells.length === 0 ? (
              <div className="text-xs italic text-gray-400 dark:text-gray-500 px-2 py-1">
                No goals defined for this pillar.
              </div>
            ) : (
              row.cells.map((cell) => {
                const palette = PRIORITY_PALETTE[cell.priority];
                const width = barWidthPct(
                  cell.cards_in_window,
                  expectedPerCell,
                );
                const driftLabel =
                  cell.drift >= 0
                    ? `+${cell.drift.toFixed(1)}`
                    : cell.drift.toFixed(1);
                return (
                  <div
                    key={cell.goal_id}
                    role="row"
                    className={cn(
                      "grid items-center gap-2 py-1 pr-1 rounded-md text-left",
                      palette.ring,
                    )}
                    style={{
                      gridTemplateColumns:
                        "auto minmax(0, 1fr) minmax(0, 2.5fr) auto auto",
                    }}
                    title={`${cell.goal_code} — ${cell.goal_name} · ${cell.cards_in_window}/${expectedPerCell.toFixed(1)} expected · drift ${driftLabel}`}
                    aria-label={`${cell.goal_code} ${cell.goal_name}, ${cell.cards_in_window} cards vs expected ${expectedPerCell.toFixed(1)}, priority ${cell.priority}`}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-mono tabular-nums w-12 pl-2",
                        palette.label,
                      )}
                    >
                      {cell.goal_code}
                    </span>
                    <span
                      className={cn(
                        "text-xs truncate",
                        cell.priority === "none"
                          ? "text-gray-700 dark:text-gray-200"
                          : palette.label,
                      )}
                    >
                      {cell.goal_name}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2 rounded-full overflow-hidden",
                        palette.track,
                      )}
                    >
                      {cell.cards_in_window > 0 && (
                        <span
                          className={cn(
                            "block h-full rounded-full transition-all duration-300",
                            palette.fill,
                          )}
                          style={{ width: `${width.toFixed(2)}%` }}
                        />
                      )}
                    </span>
                    <span className="text-xs font-semibold tabular-nums w-12 text-right pr-1 text-gray-900 dark:text-gray-100">
                      {cell.cards_in_window}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium tabular-nums w-12 text-right pr-2",
                        palette.label,
                      )}
                    >
                      {driftLabel}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CoverageGapHeatmap;
