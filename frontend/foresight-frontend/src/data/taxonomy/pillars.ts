/**
 * CSP Pillars (6): the top-level strategic categories that organize
 * the City of Austin's framework. Used for card classification,
 * filtering, and dashboard grouping.
 *
 * @module data/taxonomy/pillars
 */

import type { Pillar } from "./types";

export const pillars: Pillar[] = [
  {
    code: "CH",
    name: "Community Health & Sustainability",
    description:
      "Public health, parks, climate, preparedness, and animal services",
    color: "#22c55e",
    colorLight: "#dcfce7",
    colorDark: "#166534",
    icon: "Heart",
  },
  {
    code: "EW",
    name: "Economic & Workforce Development",
    description:
      "Economic mobility, small business support, and creative economy",
    color: "#3b82f6",
    colorLight: "#dbeafe",
    colorDark: "#1e40af",
    icon: "Briefcase",
  },
  {
    code: "HG",
    name: "High-Performing Government",
    description:
      "Fiscal integrity, technology, workforce, and community engagement",
    color: "#6366f1",
    colorLight: "#e0e7ff",
    colorDark: "#3730a3",
    icon: "Building2",
  },
  {
    code: "HH",
    name: "Homelessness & Housing",
    description:
      "Complete communities, affordable housing, and homelessness reduction",
    color: "#ec4899",
    colorLight: "#fce7f3",
    colorDark: "#9d174d",
    icon: "Home",
  },
  {
    code: "MC",
    name: "Mobility & Critical Infrastructure",
    description: "Transportation, transit, utilities, and facility management",
    color: "#f59e0b",
    colorLight: "#fef3c7",
    colorDark: "#b45309",
    icon: "Car",
  },
  {
    code: "PS",
    name: "Public Safety",
    description:
      "Community relationships, fair delivery, and disaster preparedness",
    color: "#ef4444",
    colorLight: "#fee2e2",
    colorDark: "#b91c1c",
    icon: "Shield",
  },
];

/**
 * Pillar lookup that supports exact codes and common abbreviations
 * (e.g. `"ENV"` → CH, `"HOUSING"` → HH).
 */
export function getPillarByCode(code: string): Pillar | undefined {
  if (!code) return undefined;
  const upperCode = code.toUpperCase();

  const direct = pillars.find((p) => p.code === upperCode);
  if (direct) return direct;

  const abbreviationMap: Record<string, string> = {
    ES: "CH",
    ENV: "CH",
    HEALTH: "CH",
    ECON: "EW",
    GOV: "HG",
    HOUSING: "HH",
    MOBILITY: "MC",
    INFRA: "MC",
    SAFETY: "PS",
  };

  const mappedCode = abbreviationMap[upperCode];
  if (mappedCode) {
    return pillars.find((p) => p.code === mappedCode);
  }

  return undefined;
}

export const pillarMap: Record<string, Pillar> = pillars.reduce(
  (acc, pillar) => {
    acc[pillar.code] = pillar;
    return acc;
  },
  {} as Record<string, Pillar>,
);
