/**
 * Strategic Anchors (6): the cross-cutting principles (Equity,
 * Affordability, Innovation, Sustainability & Resiliency, Proactive
 * Prevention, Community Trust & Relationships) that span every pillar.
 *
 * @module data/taxonomy/anchors
 */

import type { Anchor } from "./types";

export const anchors: Anchor[] = [
  {
    name: "Equity",
    description: "Ensuring fair access and outcomes for all residents",
    icon: "Scale",
  },
  {
    name: "Affordability",
    description: "Keeping Austin accessible for all income levels",
    icon: "DollarSign",
  },
  {
    name: "Innovation",
    description: "Embracing new approaches and technologies",
    icon: "Lightbulb",
  },
  {
    name: "Sustainability & Resiliency",
    description: "Environmental protection and disaster readiness",
    icon: "Leaf",
  },
  {
    name: "Proactive Prevention",
    description: "Addressing issues before they become crises",
    icon: "ShieldCheck",
  },
  {
    name: "Community Trust & Relationships",
    description: "Building strong connections with residents",
    icon: "Users",
  },
];

/**
 * Anchor lookup supporting exact-match, keyword-map, and fuzzy
 * `includes`-based matching.
 */
export function getAnchorByName(name: string): Anchor | undefined {
  if (!name) return undefined;
  const lowerName = name.toLowerCase().trim();

  const direct = anchors.find((a) => a.name.toLowerCase() === lowerName);
  if (direct) return direct;

  const keywordMap: Record<string, string> = {
    equity: "Equity",
    afford: "Affordability",
    affordability: "Affordability",
    innov: "Innovation",
    innovation: "Innovation",
    sustain: "Sustainability & Resiliency",
    sustainability: "Sustainability & Resiliency",
    resiliency: "Sustainability & Resiliency",
    resilience: "Sustainability & Resiliency",
    prevent: "Proactive Prevention",
    prevention: "Proactive Prevention",
    proactive: "Proactive Prevention",
    trust: "Community Trust & Relationships",
    community: "Community Trust & Relationships",
    relationship: "Community Trust & Relationships",
  };

  const mappedName = keywordMap[lowerName];
  if (mappedName) {
    return anchors.find((a) => a.name === mappedName);
  }

  const fuzzy = anchors.find((a) => {
    const lowerAnchor = a.name.toLowerCase();
    if (lowerAnchor.includes(lowerName)) return true;
    const firstWord = lowerAnchor.split(" ")[0];
    return firstWord ? lowerName.includes(firstWord) : false;
  });
  if (fuzzy) return fuzzy;

  return undefined;
}

export const anchorMap: Record<string, Anchor> = anchors.reduce(
  (acc, anchor) => {
    acc[anchor.name] = anchor;
    return acc;
  },
  {} as Record<string, Anchor>,
);
