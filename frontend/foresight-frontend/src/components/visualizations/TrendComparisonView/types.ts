/**
 * Shared types for the TrendComparisonView module.
 *
 * @module components/visualizations/TrendComparisonView/types
 */

import type { ScoreType } from "../ScoreTimelineChart";

export interface ScoreDifference {
  scoreType: ScoreType;
  name: string;
  card1Value: number | null;
  card2Value: number | null;
  difference: number | null;
  percentChange: number | null;
}

export interface MergedDataPoint {
  date: string;
  timestamp: number;
  card1_maturity: number | null;
  card1_velocity: number | null;
  card1_novelty: number | null;
  card1_impact: number | null;
  card1_relevance: number | null;
  card1_risk: number | null;
  card1_opportunity: number | null;
  card2_maturity: number | null;
  card2_velocity: number | null;
  card2_novelty: number | null;
  card2_impact: number | null;
  card2_relevance: number | null;
  card2_risk: number | null;
  card2_opportunity: number | null;
}
