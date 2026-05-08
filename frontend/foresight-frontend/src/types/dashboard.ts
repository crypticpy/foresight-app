/**
 * Dashboard v2 types — mirrors backend/app/models/analytics.py
 * (LensOverviewResponse and friends).
 *
 * Kept in `types/` rather than `lib/dashboard-api.ts` so that visualization
 * components can depend on the shapes without importing the fetch client.
 */

import type { AnchorCode } from "../lib/lens-api";

export type SignalTypeBucket = "trend" | "driver" | "signal" | "unclassified";

export type LensSparklineMetric =
  | "new_cards"
  | "updated_cards"
  | "new_classifications"
  | "new_follows"
  | "new_workstream_cards";

export interface AnchorOverview {
  code: AnchorCode;
  name: string;
  mean_score: number;
  high_score_count: number;
  scored_card_count: number;
}

export interface CspGoalCoverage {
  goal_id: string;
  code: string;
  name: string;
  pillar_code: string;
  card_count: number;
}

export interface SignalTypeMix {
  signal_type: SignalTypeBucket;
  count: number;
}

export interface IssueTagCount {
  tag: string;
  count: number;
}

export interface SparklinePoint {
  date: string;
  value: number;
}

export interface KpiSparkline {
  metric: LensSparklineMetric;
  points: SparklinePoint[];
}

export interface LensDelta24h {
  new_cards: number;
  new_classifications: number;
  new_follows: number;
  new_workstream_cards: number;
}

export interface LensOverviewResponse {
  anchor_means: AnchorOverview[];
  csp_coverage: CspGoalCoverage[];
  signal_type_counts: SignalTypeMix[];
  top_issue_tags: IssueTagCount[];
  budget_flag_count: number;
  climate_flag_count: number;
  sparklines: KpiSparkline[];
  delta_24h: LensDelta24h;
  classified_card_count: number;
  total_active_cards: number;
  period_days: number;
  generated_at: string;
}
