/**
 * Maturity Stages (8): Concept → Declining progression aligned to
 * horizons H1/H2/H3. Used for card-level maturity classification.
 *
 * Names, numbering, and order are the frontend mirror of the backend
 * source of truth in `backend/app/taxonomy.py` (`STAGE_NAMES` /
 * `STAGE_NUMBER_TO_ID`). Keep them in sync — `StageBadge` and the stage
 * timeline render these names directly, so drift here mislabels cards.
 *
 * @module data/taxonomy/stages
 */

import type { MaturityStage } from "./types";

export const stages: MaturityStage[] = [
  {
    stage: 1,
    name: "Concept",
    horizon: "H3",
    description: "Early-stage idea or research; not yet built or tested.",
    signals: "Academic papers, theoretical frameworks, R&D announcements",
  },
  {
    stage: 2,
    name: "Exploring",
    horizon: "H3",
    description:
      "Active investigation and experimentation; feasibility being assessed.",
    signals: "Lab experiments, grant funding, early-stage startups",
  },
  {
    stage: 3,
    name: "Pilot",
    horizon: "H2",
    description: "Tested in a limited real-world setting to gauge viability.",
    signals: 'Limited field trials, "Company X launches pilot..."',
  },
  {
    stage: 4,
    name: "Proof of Concept",
    horizon: "H2",
    description: "Pilot results validate that the approach works as intended.",
    signals: "Published pilot outcomes, validated demos, case studies",
  },
  {
    stage: 5,
    name: "Implementing",
    horizon: "H1",
    description: "Being deployed into regular operations.",
    signals: "Procurement, rollout announcements, vendor contracts",
  },
  {
    stage: 6,
    name: "Scaling",
    horizon: "H1",
    description: "Proven and expanding across more users, sites, or agencies.",
    signals: "Multi-site rollouts, growing adoption, budget increases",
  },
  {
    stage: 7,
    name: "Mature",
    horizon: "H1",
    description: "Established and widely adopted as standard practice.",
    signals: "Industry standards, broad adoption, commoditized offerings",
  },
  {
    stage: 8,
    name: "Declining",
    horizon: "H1",
    description: "Being phased out or replaced by newer approaches.",
    signals: "Sunset announcements, falling usage, replacement by alternatives",
  },
];

export function getStageByNumber(stageNum: number): MaturityStage | undefined {
  return stages.find((s) => s.stage === stageNum);
}

export function getStagesByHorizon(
  horizon: "H1" | "H2" | "H3",
): MaturityStage[] {
  return stages.filter((s) => s.horizon === horizon);
}

export const stageMap: Record<number, MaturityStage> = stages.reduce(
  (acc, stage) => {
    acc[stage.stage] = stage;
    return acc;
  },
  {} as Record<number, MaturityStage>,
);
