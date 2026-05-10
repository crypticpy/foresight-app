/**
 * Pure data transforms for the comparison view: per-score diff of the
 * latest snapshot for each card, and a date-merged time series so both
 * cards can be plotted on a single Recharts chart.
 *
 * @module components/visualizations/TrendComparisonView/data
 */

import type { CardData, ScoreHistory } from "../../../lib/discovery-api";
import { SCORE_CONFIGS } from "../ScoreTimelineChart";
import type { MergedDataPoint, ScoreDifference } from "./types";

/** Calculate score differences between two cards. */
export function calculateScoreDifferences(
  card1: CardData,
  card2: CardData,
): ScoreDifference[] {
  return SCORE_CONFIGS.map((config) => {
    const card1Value = card1[config.key];
    const card2Value = card2[config.key];

    let difference: number | null = null;
    let percentChange: number | null = null;

    if (card1Value !== null && card2Value !== null) {
      difference = card2Value - card1Value;
      if (card1Value !== 0) {
        percentChange = ((card2Value - card1Value) / card1Value) * 100;
      }
    }

    return {
      scoreType: config.key,
      name: config.name,
      card1Value,
      card2Value,
      difference,
      percentChange,
    };
  });
}

/**
 * Merge score history from two cards into a unified timeline keyed by
 * `recorded_at`. Per-card sample dates often don't align, so missing
 * values stay `null` and the chart's `connectNulls` flag draws through
 * the gap.
 */
export function mergeScoreHistories(
  history1: ScoreHistory[],
  history2: ScoreHistory[],
): MergedDataPoint[] {
  const dateMap = new Map<string, MergedDataPoint>();

  history1.forEach((record) => {
    const dateKey = record.recorded_at;
    const existing = dateMap.get(dateKey);
    dateMap.set(dateKey, {
      date: dateKey,
      timestamp: new Date(dateKey).getTime(),
      card1_maturity: record.maturity_score,
      card1_velocity: record.velocity_score,
      card1_novelty: record.novelty_score,
      card1_impact: record.impact_score,
      card1_relevance: record.relevance_score,
      card1_risk: record.risk_score,
      card1_opportunity: record.opportunity_score,
      card2_maturity: existing?.card2_maturity ?? null,
      card2_velocity: existing?.card2_velocity ?? null,
      card2_novelty: existing?.card2_novelty ?? null,
      card2_impact: existing?.card2_impact ?? null,
      card2_relevance: existing?.card2_relevance ?? null,
      card2_risk: existing?.card2_risk ?? null,
      card2_opportunity: existing?.card2_opportunity ?? null,
    });
  });

  history2.forEach((record) => {
    const dateKey = record.recorded_at;
    const existing = dateMap.get(dateKey);
    if (existing) {
      existing.card2_maturity = record.maturity_score;
      existing.card2_velocity = record.velocity_score;
      existing.card2_novelty = record.novelty_score;
      existing.card2_impact = record.impact_score;
      existing.card2_relevance = record.relevance_score;
      existing.card2_risk = record.risk_score;
      existing.card2_opportunity = record.opportunity_score;
    } else {
      dateMap.set(dateKey, {
        date: dateKey,
        timestamp: new Date(dateKey).getTime(),
        card1_maturity: null,
        card1_velocity: null,
        card1_novelty: null,
        card1_impact: null,
        card1_relevance: null,
        card1_risk: null,
        card1_opportunity: null,
        card2_maturity: record.maturity_score,
        card2_velocity: record.velocity_score,
        card2_novelty: record.novelty_score,
        card2_impact: record.impact_score,
        card2_relevance: record.relevance_score,
        card2_risk: record.risk_score,
        card2_opportunity: record.opportunity_score,
      });
    }
  });

  return Array.from(dateMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}
