/**
 * Type definitions for the Foresight taxonomy: pillars, goals, anchors,
 * maturity stages, horizons, Top 25 priorities, STEEP categories, and
 * triage scores.
 *
 * @module data/taxonomy/types
 */

export interface Pillar {
  code: string;
  name: string;
  description: string;
  color: string;
  colorLight: string;
  colorDark: string;
  icon: string;
}

export interface Goal {
  code: string;
  pillarCode: string;
  name: string;
  description?: string;
}

export interface Anchor {
  name: string;
  description: string;
  icon: string;
}

export interface MaturityStage {
  stage: number;
  name: string;
  horizon: "H1" | "H2" | "H3";
  description: string;
  signals: string;
}

export interface Horizon {
  code: "H1" | "H2" | "H3";
  name: string;
  timeframe: string;
  description: string;
  color: string;
  colorLight: string;
}

export interface Top25Priority {
  id: string;
  title: string;
  pillarCode: string;
}

export interface SteepCategory {
  code: string;
  name: string;
  description: string;
}

export interface TriageScore {
  score: 1 | 3 | 5;
  name: string;
  description: string;
}
