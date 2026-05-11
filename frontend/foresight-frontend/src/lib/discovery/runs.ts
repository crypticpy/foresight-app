/**
 * Discovery-run API: trigger, list, fetch, and cancel pipeline runs, plus the
 * read-only system configuration endpoint.
 *
 * @module lib/discovery/runs
 */

import { apiRequest } from "./shared";

/**
 * Configuration for a discovery run.
 *
 * Optional parameters that constrain what the discovery pipeline searches for.
 * Stored alongside the run record for reproducibility.
 */
export interface DiscoveryRunConfig {
  /** Source types to include (e.g., 'rss', 'newsapi', 'tavily') */
  source_types?: string[];
  /** Strategic pillar codes to focus on (e.g., ['CH', 'MC']) */
  pillar_focus?: string[];
  /** Maximum number of cards to create in this run */
  max_cards?: number;
}

/**
 * Discovery run metadata.
 *
 * Tracks the execution and results of a single discovery pipeline run.
 * Matches the backend `DiscoveryRun` Pydantic model.
 */
export interface DiscoveryRun {
  /** Unique run identifier (UUID) */
  id: string;
  /** ISO 8601 timestamp when the run started */
  started_at: string;
  /** ISO 8601 timestamp when the run completed, or null if still running */
  completed_at: string | null;
  /** Current run status */
  status: "running" | "completed" | "failed" | "cancelled";
  /** How the run was initiated */
  triggered_by: "manual" | "scheduled" | "api";
  /** User ID of the user who triggered the run, or null for scheduled runs */
  triggered_by_user: string | null;
  /** Strategic pillars that were scanned in this run */
  pillars_scanned: string[] | null;
  /** Top 25 priorities that were scanned in this run */
  priorities_scanned: string[] | null;
  /** Number of search queries generated for this run */
  queries_generated: number | null;
  /** Total number of sources discovered */
  sources_found: number;
  /** Number of sources that passed relevance triage */
  sources_relevant: number | null;
  /** Number of new cards created from discovered sources */
  cards_created: number;
  /** Number of existing cards enriched with new information */
  cards_enriched: number;
  /** Number of duplicate cards detected and merged */
  cards_deduplicated: number;
  /** Estimated API cost for this run in USD */
  estimated_cost: number | null;
  /** Structured summary report with run statistics */
  summary_report: Record<string, unknown> | null;
  /** Human-readable error message if the run failed */
  error_message: string | null;
  /** Detailed error information for debugging */
  error_details: Record<string, unknown> | null;
  /** List of non-fatal error messages encountered during the run */
  errors?: string[];
  /** ISO 8601 timestamp when the run record was created */
  created_at: string | null;
  /** Run configuration parameters, populated for detailed run views */
  config?: DiscoveryRunConfig;
}

/**
 * Request model for configuring a discovery run.
 *
 * Matches the backend `DiscoveryConfigRequest` Pydantic model.
 * All fields are optional overrides of the system defaults.
 */
export interface DiscoveryConfigRequest {
  /** Maximum number of search queries to generate per run */
  max_queries_per_run?: number;
  /** Maximum total sources to process across all queries */
  max_sources_total?: number;
  /** AI confidence threshold for auto-approving cards (0-1) */
  auto_approve_threshold?: number;
  /** Strategic pillar codes to restrict the scan to */
  pillars_filter?: string[];
  /** If true, simulate the run without creating cards */
  dry_run?: boolean;
}

/**
 * Current discovery system configuration from backend environment.
 *
 * Read-only view of the active system defaults that govern discovery runs.
 */
export interface DiscoveryConfig {
  /** Maximum search queries generated per run */
  max_queries_per_run: number;
  /** Maximum total sources processed across all queries */
  max_sources_total: number;
  /** Maximum sources fetched per individual query */
  max_sources_per_query: number;
  /** AI confidence threshold for auto-approving cards (0-1) */
  auto_approve_threshold: number;
  /** Vector similarity threshold for deduplication (0-1) */
  similarity_threshold: number;
}

/**
 * Fetch discovery run history
 */
export function fetchDiscoveryRuns(
  token: string,
  limit: number = 10,
): Promise<DiscoveryRun[]> {
  return apiRequest<DiscoveryRun[]>(
    `/api/v1/discovery/runs?limit=${limit}`,
    token,
  );
}

/**
 * Fetch a specific discovery run
 */
export function fetchDiscoveryRun(
  token: string,
  runId: string,
): Promise<DiscoveryRun> {
  return apiRequest<DiscoveryRun>(`/api/v1/discovery/runs/${runId}`, token);
}

/**
 * Fetch current discovery configuration from server
 */
export function fetchDiscoveryConfig(token: string): Promise<DiscoveryConfig> {
  return apiRequest<DiscoveryConfig>("/api/v1/discovery/config", token);
}

/**
 * Trigger a new discovery run
 */
export function triggerDiscoveryRun(
  token: string,
  config?: DiscoveryConfigRequest,
): Promise<{ run_id: string }> {
  return apiRequest<{ run_id: string }>("/api/v1/discovery/run", token, {
    method: "POST",
    body: JSON.stringify(config || {}),
  });
}

/**
 * Cancel an in-progress discovery run
 */
export function cancelDiscoveryRun(
  token: string,
  runId: string,
): Promise<void> {
  return apiRequest<void>(`/api/v1/discovery/runs/${runId}/cancel`, token, {
    method: "POST",
  });
}
