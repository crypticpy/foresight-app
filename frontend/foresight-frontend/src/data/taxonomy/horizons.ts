/**
 * Horizons (3): time-band classifications (H1 mainstream, H2
 * transitional, H3 transformative) that drive the timeline view and
 * tie back to maturity stages.
 *
 * @module data/taxonomy/horizons
 */

import { getStageByNumber } from "./stages";
import type { Horizon } from "./types";

export const horizons: Horizon[] = [
  {
    code: "H1",
    name: "Mainstream",
    timeframe: "0-3 years",
    description: "Current system, confirms baseline",
    color: "#22c55e",
    colorLight: "#dcfce7",
  },
  {
    code: "H2",
    name: "Transitional",
    timeframe: "3-7 years",
    description: "Emerging alternatives, pilots",
    color: "#f59e0b",
    colorLight: "#fef3c7",
  },
  {
    code: "H3",
    name: "Transformative",
    timeframe: "7-15+ years",
    description: "Weak signals, novel possibilities",
    color: "#a855f7",
    colorLight: "#f3e8ff",
  },
];

export function getHorizonByCode(
  code: "H1" | "H2" | "H3",
): Horizon | undefined {
  return horizons.find((h) => h.code === code);
}

/** Resolves the horizon associated with a given stage number. */
export function getHorizonForStage(stageNum: number): Horizon | undefined {
  const stage = getStageByNumber(stageNum);
  if (!stage) return undefined;
  return getHorizonByCode(stage.horizon);
}

export const horizonMap: Record<string, Horizon> = horizons.reduce(
  (acc, horizon) => {
    acc[horizon.code] = horizon;
    return acc;
  },
  {} as Record<string, Horizon>,
);
