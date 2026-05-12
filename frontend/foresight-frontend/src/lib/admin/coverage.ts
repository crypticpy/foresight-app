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
  total: number;
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
