/**
 * Triage Scores (3): the value classifications attached to incoming
 * signals during the triage pass — Confirming (1) / Resolving (3) /
 * Novel (5).
 *
 * @module data/taxonomy/triage
 */

import type { TriageScore } from "./types";

export const triageScores: TriageScore[] = [
  {
    score: 1,
    name: "Confirming",
    description: "Confirms what we already know (baseline)",
  },
  {
    score: 3,
    name: "Resolving",
    description: "Provides evidence for one of known alternatives",
  },
  {
    score: 5,
    name: "Novel",
    description: "Suggests new possibility not previously considered",
  },
];

export function getTriageScore(score: 1 | 3 | 5): TriageScore | undefined {
  return triageScores.find((t) => t.score === score);
}
