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
  cards: number;
  share: number;
  expected_share: number;
  drift: number;
}

export interface PillarCoverageResponse {
  window_days: number;
  since: string;
  total: number;
  unassigned: number;
  by_pillar: Record<string, PillarCoverageBucket>;
}

export type CoverageWindowDays = 7 | 30 | 90;

export function fetchPillarCoverage(
  token: string,
  days: CoverageWindowDays,
): Promise<PillarCoverageResponse> {
  return apiRequest<PillarCoverageResponse>(
    `/api/v1/admin/coverage/pillars?days=${days}`,
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
