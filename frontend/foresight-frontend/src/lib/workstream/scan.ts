/**
 * Workstream scan surface: start a targeted discovery scan, poll its status,
 * and read recent history. Scans are rate-limited to 2/day per workstream.
 *
 * @module lib/workstream/scan
 */

import { apiRequest } from "./shared";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * Response for starting a workstream scan.
 */
export interface WorkstreamScanResponse {
  /** UUID of the scan job */
  scan_id: string;
  /** UUID of the workstream */
  workstream_id: string;
  /** Scan status (queued, running, completed, failed) */
  status: "queued" | "running" | "completed" | "failed";
  /** User-friendly status message */
  message: string;
}

/**
 * Configuration snapshot for a scan.
 */
export interface WorkstreamScanConfig {
  workstream_id: string;
  user_id: string;
  keywords: string[];
  pillar_ids: string[];
  horizon: string;
}

/**
 * Results from a completed scan.
 */
export interface WorkstreamScanResults {
  queries_executed: number;
  sources_fetched: number;
  sources_by_category: Record<string, number>;
  sources_triaged: number;
  cards_created: number;
  cards_enriched: number;
  cards_added_to_workstream: number;
  duplicates_skipped: number;
  execution_time_seconds: number;
  errors: string[];
}

/**
 * Detailed scan status response.
 */
export interface WorkstreamScanStatusResponse {
  scan_id: string;
  workstream_id: string;
  status: "queued" | "running" | "completed" | "failed";
  config?: WorkstreamScanConfig;
  results?: WorkstreamScanResults;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  created_at: string;
}

/**
 * Response for scan history.
 */
export interface WorkstreamScanHistoryResponse {
  scans: WorkstreamScanStatusResponse[];
  total: number;
  scans_remaining_today: number;
}

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

/**
 * Start a targeted discovery scan for a workstream.
 *
 * Generates queries from workstream keywords and pillars, fetches content
 * from all 5 source categories, and creates new cards that are added to
 * the global pool and auto-added to the workstream inbox.
 *
 * Rate limited to 2 scans per workstream per day.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @returns Scan response with scan_id and queued status
 * @throws Error with 429 status if rate limit exceeded
 *
 * @example
 * ```typescript
 * try {
 *   const scan = await startWorkstreamScan(token, wsId);
 *   console.log(`Scan ${scan.scan_id} started: ${scan.message}`);
 * } catch (e) {
 *   if (e.message.includes('Rate limit')) {
 *     console.log('Try again tomorrow');
 *   }
 * }
 * ```
 */
export async function startWorkstreamScan(
  token: string,
  workstreamId: string,
): Promise<WorkstreamScanResponse> {
  return apiRequest<WorkstreamScanResponse>(
    `/api/v1/me/workstreams/${workstreamId}/scan`,
    token,
    {
      method: "POST",
    },
  );
}

/**
 * Get the status of a workstream scan.
 *
 * Returns the latest scan status by default, or a specific scan if scan_id provided.
 * Use this for polling during scan execution.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @param scanId - Optional specific scan ID to check
 * @returns Detailed scan status with config and results
 *
 * @example
 * ```typescript
 * // Poll for scan completion
 * const status = await getWorkstreamScanStatus(token, wsId);
 * if (status.status === 'completed') {
 *   console.log(`Found ${status.results?.cards_created} new cards`);
 * }
 * ```
 */
export async function getWorkstreamScanStatus(
  token: string,
  workstreamId: string,
  scanId?: string,
): Promise<WorkstreamScanStatusResponse> {
  const url = scanId
    ? `/api/v1/me/workstreams/${workstreamId}/scan/status?scan_id=${scanId}`
    : `/api/v1/me/workstreams/${workstreamId}/scan/status`;
  return apiRequest<WorkstreamScanStatusResponse>(url, token);
}

/**
 * Get scan history for a workstream.
 *
 * Returns recent scans and remaining daily quota.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @param limit - Maximum number of scans to return (default 10)
 * @returns Scan history and remaining daily quota
 *
 * @example
 * ```typescript
 * const history = await getWorkstreamScanHistory(token, wsId);
 * console.log(`${history.scans_remaining_today} scans remaining today`);
 * ```
 */
export async function getWorkstreamScanHistory(
  token: string,
  workstreamId: string,
  limit?: number,
): Promise<WorkstreamScanHistoryResponse> {
  const url = limit
    ? `/api/v1/me/workstreams/${workstreamId}/scan/history?limit=${limit}`
    : `/api/v1/me/workstreams/${workstreamId}/scan/history`;
  return apiRequest<WorkstreamScanHistoryResponse>(url, token);
}
