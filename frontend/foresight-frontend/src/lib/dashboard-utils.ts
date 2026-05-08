/**
 * Pure helpers for the Dashboard v2 KPI strip — sparkline indexing and
 * totalling. Kept out of the page component so they can be unit-tested
 * and reused without rendering the dashboard.
 */

import type { KpiSparkline, LensSparklineMetric } from "../types/dashboard";

export type SparklineByMetric = Partial<
  Record<LensSparklineMetric, KpiSparkline>
>;

/** Index a sparkline list by metric for O(1) lookups in the KPI grid. */
export function buildSparklineByMetric(
  sparklines: KpiSparkline[] | undefined,
): SparklineByMetric {
  const out: SparklineByMetric = {};
  for (const series of sparklines ?? []) {
    out[series.metric] = series;
  }
  return out;
}

/** Sum a sparkline's daily values; null when the series is absent. */
export function sparklineTotal(
  series: KpiSparkline | undefined,
): number | null {
  if (!series) return null;
  return series.points.reduce((sum, p) => sum + p.value, 0);
}
