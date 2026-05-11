/**
 * Maturity Stages (8): Concept → Mature progression aligned to
 * horizons H1/H2/H3. Used for card-level maturity classification.
 *
 * @module data/taxonomy/stages
 */

import type { MaturityStage } from "./types";

export const stages: MaturityStage[] = [
  {
    stage: 1,
    name: "Concept",
    horizon: "H3",
    description: "Academic research, theoretical exploration",
    signals: "arXiv papers, university research",
  },
  {
    stage: 2,
    name: "Emerging",
    horizon: "H3",
    description: "Startups forming, patents filed",
    signals: "VC funding, patent filings",
  },
  {
    stage: 3,
    name: "Prototype",
    horizon: "H2",
    description: "Working demos exist",
    signals: 'Conference demos, "proof of concept"',
  },
  {
    stage: 4,
    name: "Pilot",
    horizon: "H2",
    description: "Real-world testing (private sector)",
    signals: '"Company X announces pilot..."',
  },
  {
    stage: 5,
    name: "Municipal Pilot",
    horizon: "H2",
    description: "Government entity testing",
    signals: '"City of X announces..."',
  },
  {
    stage: 6,
    name: "Early Adoption",
    horizon: "H1",
    description: "Multiple cities implementing",
    signals: "Pattern of announcements",
  },
  {
    stage: 7,
    name: "Mainstream",
    horizon: "H1",
    description: "Widespread adoption",
    signals: '"Cities across the country..."',
  },
  {
    stage: 8,
    name: "Mature",
    horizon: "H1",
    description: "Established, commoditized",
    signals: "Industry standards exist",
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
