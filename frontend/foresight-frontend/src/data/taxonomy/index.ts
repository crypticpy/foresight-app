/**
 * Public barrel for the Foresight taxonomy: re-exports types, data
 * arrays, lookup helpers, and code-indexed maps from the per-domain
 * modules so callers can keep importing from `data/taxonomy`.
 *
 * @module data/taxonomy
 */

export type {
  Anchor,
  Goal,
  Horizon,
  MaturityStage,
  Pillar,
  SteepCategory,
  Top25Priority,
  TriageScore,
} from "./types";

export { anchorMap, anchors, getAnchorByName } from "./anchors";
export { getGoalByCode, getGoalsByPillar, goalMap, goals } from "./goals";
export {
  getHorizonByCode,
  getHorizonForStage,
  horizonMap,
  horizons,
} from "./horizons";
export { getPillarByCode, pillarMap, pillars } from "./pillars";
export {
  getStageByNumber,
  getStagesByHorizon,
  stageMap,
  stages,
} from "./stages";
export { getSteepByCode, steepCategories } from "./steep";
export { getTop25ByPillar, getTop25ByTitle, top25Priorities } from "./top25";
export { getTriageScore, triageScores } from "./triage";
