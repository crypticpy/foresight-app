/**
 * STEEP Categories (5): Social / Technological / Economic /
 * Environmental / Political — the macro lenses used for trend
 * classification.
 *
 * @module data/taxonomy/steep
 */

import type { SteepCategory } from "./types";

export const steepCategories: SteepCategory[] = [
  {
    code: "S",
    name: "Social",
    description: "Demographics, culture, lifestyle, public opinion",
  },
  {
    code: "T",
    name: "Technological",
    description: "Innovation, R&D, digital transformation",
  },
  {
    code: "Ec",
    name: "Economic",
    description: "Markets, employment, trade, fiscal policy",
  },
  {
    code: "En",
    name: "Environmental",
    description: "Climate, resources, sustainability",
  },
  {
    code: "P",
    name: "Political",
    description: "Policy, regulation, governance, elections",
  },
];

export function getSteepByCode(code: string): SteepCategory | undefined {
  return steepCategories.find((s) => s.code === code);
}
