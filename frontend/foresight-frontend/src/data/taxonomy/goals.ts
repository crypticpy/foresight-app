/**
 * CSP Goals (23): pillar-scoped strategic goals. Each goal references
 * its parent pillar via `pillarCode`.
 *
 * @module data/taxonomy/goals
 */

import type { Goal } from "./types";

export const goals: Goal[] = [
  // Community Health & Sustainability (CH)
  {
    code: "CH.1",
    pillarCode: "CH",
    name: "Ensure equitable delivery of core public health services",
  },
  {
    code: "CH.2",
    pillarCode: "CH",
    name: "Preserve equitable access to parks, trails, and recreation",
  },
  {
    code: "CH.3",
    pillarCode: "CH",
    name: "Protect natural resources and mitigate climate change",
  },
  {
    code: "CH.4",
    pillarCode: "CH",
    name: "Increase community preparedness and resiliency",
  },
  {
    code: "CH.5",
    pillarCode: "CH",
    name: "Operate Animal Centers efficiently with high-quality care",
  },

  // Economic & Workforce Development (EW)
  {
    code: "EW.1",
    pillarCode: "EW",
    name: "Equip and empower the community for economic mobility",
  },
  {
    code: "EW.2",
    pillarCode: "EW",
    name: "Promote a resilient economy prioritizing small and BIPOC businesses",
  },
  {
    code: "EW.3",
    pillarCode: "EW",
    name: "Preserve and enrich Austin's creative ecosystem",
  },

  // High-Performing Government (HG)
  {
    code: "HG.1",
    pillarCode: "HG",
    name: "Ensure fiscal integrity and responsibility",
  },
  {
    code: "HG.2",
    pillarCode: "HG",
    name: "Enhance data and technology capabilities",
  },
  {
    code: "HG.3",
    pillarCode: "HG",
    name: "Recruit and retain a talented, diverse workforce",
  },
  {
    code: "HG.4",
    pillarCode: "HG",
    name: "Provide equitable outreach and collaborative engagement",
  },

  // Homelessness & Housing (HH)
  {
    code: "HH.1",
    pillarCode: "HH",
    name: "Support complete communities with accessible necessities",
  },
  {
    code: "HH.2",
    pillarCode: "HH",
    name: "Prioritize development/preservation of affordable housing",
  },
  {
    code: "HH.3",
    pillarCode: "HH",
    name: "Reduce the number of people experiencing homelessness",
  },

  // Mobility & Critical Infrastructure (MC)
  {
    code: "MC.1",
    pillarCode: "MC",
    name: "Prioritize mobility safety and public health",
  },
  {
    code: "MC.2",
    pillarCode: "MC",
    name: "Invest in high-capacity transit and airport expansion",
  },
  {
    code: "MC.3",
    pillarCode: "MC",
    name: "Expand access to sustainable transportation choices",
  },
  {
    code: "MC.4",
    pillarCode: "MC",
    name: "Maintain a portfolio of safe, resilient City facilities",
  },
  {
    code: "MC.5",
    pillarCode: "MC",
    name: "Provide secure, cost-effective utility infrastructure",
  },

  // Public Safety (PS)
  {
    code: "PS.1",
    pillarCode: "PS",
    name: "Build relationships to create a sense of shared responsibility",
  },
  {
    code: "PS.2",
    pillarCode: "PS",
    name: "Ensure fair, evidence-based delivery of public safety/court services",
  },
  {
    code: "PS.3",
    pillarCode: "PS",
    name: "Invest in partnerships to adapt to hazards and disasters",
  },
];

export function getGoalByCode(code: string): Goal | undefined {
  return goals.find((g) => g.code === code);
}

export function getGoalsByPillar(pillarCode: string): Goal[] {
  return goals.filter((g) => g.pillarCode === pillarCode);
}

export const goalMap: Record<string, Goal> = goals.reduce(
  (acc, goal) => {
    acc[goal.code] = goal;
    return acc;
  },
  {} as Record<string, Goal>,
);
