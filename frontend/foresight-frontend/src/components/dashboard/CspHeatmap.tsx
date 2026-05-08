/**
 * CspHeatmap — pillar × goal coverage grid.
 *
 * Groups CSP goals by their parent pillar and renders one row per pillar.
 * Each cell is a goal with intensity proportional to its card count.
 * Empty pillars show a placeholder row so the dashboard still surfaces
 * "we have nothing in CH" at a glance.
 *
 * Pure CSS grid + Tailwind opacity scaling — no chart library.
 */

import { useMemo } from "react";
import { cn } from "../../lib/utils";
import type { CspGoalCoverage } from "../../types/dashboard";
import type { PillarCode } from "../../lib/lens-api";

export interface CspHeatmapProps {
  data: CspGoalCoverage[];
  className?: string;
  /** Click handler for a goal cell. */
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

function intensity(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  // sqrt scale so a single hit isn't invisible next to a hot goal.
  return Math.min(1, Math.sqrt(count / max));
}

function cellBgStyle(count: number, max: number): React.CSSProperties {
  const ratio = intensity(count, max);
  if (ratio === 0) return {};
  // brand-blue rgb 68/73/156
  return { backgroundColor: `rgba(68, 73, 156, ${0.12 + ratio * 0.78})` };
}

function cellTextClass(count: number, max: number): string {
  return intensity(count, max) > 0.55
    ? "text-white"
    : "text-gray-700 dark:text-gray-200";
}

export function CspHeatmap({ data, className, onGoalClick }: CspHeatmapProps) {
  const rows = useMemo(() => groupByPillar(data), [data]);
  const max = useMemo(
    () => data.reduce((m, g) => (g.card_count > m ? g.card_count : m), 0),
    [data],
  );

  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      role="table"
      aria-label="CSP goal coverage by pillar"
    >
      {rows.map((row) => (
        <div
          key={row.pillar}
          role="row"
          className="grid items-center gap-2"
          style={{ gridTemplateColumns: "120px 1fr" }}
        >
          <div
            role="rowheader"
            className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
            title={row.pillarName}
          >
            {row.pillar}{" "}
            <span className="font-normal text-gray-400 dark:text-gray-500 lowercase normal-case">
              · {row.pillarName}
            </span>
          </div>
          <div className="flex flex-wrap gap-1" role="cell">
            {row.goals.length === 0 ? (
              <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                no coverage
              </span>
            ) : (
              row.goals.map((goal) => {
                const interactive = !!onGoalClick;
                const Tag: "button" | "div" = interactive ? "button" : "div";
                return (
                  <Tag
                    key={goal.goal_id}
                    type={interactive ? "button" : undefined}
                    onClick={interactive ? () => onGoalClick!(goal) : undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-1",
                      "text-[11px] font-mono border border-gray-200/70 dark:border-gray-700/60",
                      "transition-colors duration-200",
                      cellTextClass(goal.card_count, max),
                      interactive
                        ? "hover:ring-2 hover:ring-brand-blue/40 cursor-pointer"
                        : "cursor-default",
                    )}
                    style={cellBgStyle(goal.card_count, max)}
                    title={`${goal.code} — ${goal.name} · ${goal.card_count} card${goal.card_count === 1 ? "" : "s"}`}
                    aria-label={`${goal.code} ${goal.name}, ${goal.card_count} cards`}
                  >
                    <span>{goal.code}</span>
                    <span className="opacity-80">·</span>
                    <span className="tabular-nums">{goal.card_count}</span>
                  </Tag>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CspHeatmap;
