/**
 * Coverage dashboards (PR C) plus the admin "force scan" override that lets
 * an operator kick off a workstream scan outside the normal rate limit.
 *
 * @module lib/admin/coverage
 */

import { apiRequest } from "./shared";

// ----------------------------------------------------------------------------
// Pillar coverage
// ----------------------------------------------------------------------------

export interface PillarCoverageBucket {
  name: string;
  /** Count for the selected ``mode`` — drives the bar height. */
  cards: number;
  /** Cards where this pillar is ``cards.pillar_id`` (always populated). */
  primary_cards: number;
  /** Cards where this pillar appears in ``cards.secondary_pillars``. */
  secondary_cards: number;
  /** Cards whose ``csp_goal_ids`` resolve to a goal under this pillar. */
  csp_linked_cards: number;
  share: number;
  expected_share: number;
  drift: number;
}

export type PillarCoverageMode = "primary" | "primary_or_secondary" | "union";

export interface PillarCoverageResponse {
  window_days: number;
  /** Echoes the mode the response was computed under. */
  mode: PillarCoverageMode;
  since: string;
  /** Raw card count in the window. Drives the "N cards in window" label. */
  total: number;
  /**
   * Sum of pillar-touches under the selected ``mode`` — the denominator
   * the backend uses for each bucket's ``share``. Equals ``total`` in
   * ``primary`` minus any unassigned cards; can exceed ``total`` in the
   * union modes when cards credit multiple pillars.
   */
  mode_total: number;
  unassigned: number;
  by_pillar: Record<string, PillarCoverageBucket>;
}

export type CoverageWindowDays = 7 | 30 | 90;

export function fetchPillarCoverage(
  token: string,
  days: CoverageWindowDays,
  mode: PillarCoverageMode = "primary",
): Promise<PillarCoverageResponse> {
  const params = new URLSearchParams({ days: String(days), mode });
  return apiRequest<PillarCoverageResponse>(
    `/api/v1/admin/coverage/pillars?${params.toString()}`,
    token,
  );
}

// ----------------------------------------------------------------------------
// Coverage gaps (per-goal drift heatmap)
// ----------------------------------------------------------------------------

export type GapPriority = "high" | "medium" | "none";

export interface CoverageGapCell {
  pillar_code: string;
  goal_id: string;
  goal_code: string;
  goal_name: string;
  cards_in_window: number;
  expected: number;
  drift: number;
  /** Normalized drift in ``[-1.0, +inf)`` — the heatmap color uses this. */
  drift_score: number;
  priority: GapPriority;
}

export interface CoverageGapsResponse {
  window_days: number;
  target_distribution: "uniform";
  since: string;
  /** Cells are pre-sorted starvation-first by the backend. */
  cells: CoverageGapCell[];
  totals: {
    credits: number;
    goals: number;
    expected_per_cell: number;
    underrepresented_cells: number;
  };
}

export function fetchCoverageGaps(
  token: string,
  days: CoverageWindowDays,
): Promise<CoverageGapsResponse> {
  const params = new URLSearchParams({
    days: String(days),
    target_distribution: "uniform",
  });
  return apiRequest<CoverageGapsResponse>(
    `/api/v1/admin/coverage/gaps?${params.toString()}`,
    token,
  );
}

// ----------------------------------------------------------------------------
// Workstream coverage
// ----------------------------------------------------------------------------

export interface WorkstreamCoverageItem {
  id: string;
  name: string;
  owner_type: "user" | "org";
  auto_scan: boolean;
  last_scanned_at: string | null;
  scans_30d: number;
  cards_added_30d: number;
}

export interface WorkstreamCoverageResponse {
  items: WorkstreamCoverageItem[];
  total: number;
}

export function fetchWorkstreamCoverage(
  token: string,
): Promise<WorkstreamCoverageResponse> {
  return apiRequest<WorkstreamCoverageResponse>(
    "/api/v1/admin/coverage/workstreams",
    token,
  );
}

// ----------------------------------------------------------------------------
// Force scan
// ----------------------------------------------------------------------------

export interface AdminForceScanResponse {
  scan_id: string;
  workstream_id: string;
  status: string;
}

export function adminForceWorkstreamScan(
  token: string,
  workstreamId: string,
): Promise<AdminForceScanResponse> {
  return apiRequest<AdminForceScanResponse>(
    `/api/v1/admin/workstreams/${workstreamId}/scan`,
    token,
    { method: "POST" },
  );
}

// ----------------------------------------------------------------------------
// Coverage balance dispatcher (PR-E)
// ----------------------------------------------------------------------------

export interface BalanceDispatchRequest {
  /** When omitted, the server auto-picks the most-starved goals. */
  goal_ids?: string[];
  /** Default 4. Hard cap is the service's MAX_QUERIES (6). */
  max_queries_per_goal?: number;
  /** Defaults to ["rss", "web_search"]. */
  categories?: string[];
  /** Window for the auto-pick gap calculation (ignored when goal_ids given). */
  window_days?: 7 | 30 | 90;
}

export interface BalanceDispatchGoal {
  id: string;
  code: string | null;
  name: string | null;
  pillar_code: string;
  query_count: number;
}

export interface BalanceDispatchQuery {
  query_text: string;
  pillar_code: string;
  source_context: string;
}

export interface BalanceDispatchError {
  goal_id: string;
  code: string | null;
  error: string;
}

export interface BalanceDispatchResponse {
  run_id: string;
  goals_used: BalanceDispatchGoal[];
  queued_queries: BalanceDispatchQuery[];
  derivation_errors: BalanceDispatchError[];
  categories: string[];
}

export function adminBalanceDispatch(
  token: string,
  body: BalanceDispatchRequest = {},
): Promise<BalanceDispatchResponse> {
  return apiRequest<BalanceDispatchResponse>(
    "/api/v1/admin/discovery/balance",
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
