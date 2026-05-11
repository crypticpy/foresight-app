/**
 * Discovery run detail (PR D) plus the recover/reprocess/recover-analyzed
 * trio used by the run-debug modal to re-drive failed pipeline stages.
 *
 * @module lib/admin/discovery-runs
 */

import { apiRequest } from "./shared";

// ----------------------------------------------------------------------------
// Run + per-source row shapes
// ----------------------------------------------------------------------------

export interface AdminDiscoveryRunRow {
  id: string;
  started_at: string | null;
  completed_at: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  pillars_scanned: string[] | null;
  priorities_scanned: string[] | null;
  queries_generated: number | null;
  sources_found: number | null;
  sources_relevant: number | null;
  cards_created: number | null;
  cards_enriched: number | null;
  cards_deduplicated: number | null;
  estimated_cost: number | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  summary_report: Record<string, unknown> | null;
  triggered_by: string | null;
  triggered_by_user: string | null;
  created_at: string | null;
}

export interface AdminDiscoveredSource {
  id: string;
  url: string;
  title: string | null;
  content_snippet: string | null;
  domain: string | null;
  source_type: string | null;
  published_at: string | null;
  search_query: string | null;
  query_pillar: string | null;
  query_priority: string | null;
  triage_is_relevant: boolean | null;
  triage_confidence: number | null;
  triage_primary_pillar: string | null;
  triage_reason: string | null;
  triaged_at: string | null;
  analysis_summary: string | null;
  analysis_horizon: string | null;
  analysis_suggested_card_name: string | null;
  analysis_credibility: number | null;
  analysis_novelty: number | null;
  analysis_likelihood: number | null;
  analysis_impact: number | null;
  analysis_relevance: number | null;
  analyzed_at: string | null;
  dedup_status: string | null;
  dedup_matched_card_id: string | null;
  dedup_similarity_score: number | null;
  deduplicated_at: string | null;
  processing_status: string;
  resulting_card_id: string | null;
  resulting_source_id: string | null;
  error_message: string | null;
  error_stage: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AdminRunDetailTotals {
  by_processing_status: Record<string, number>;
  by_triage: { passed: number; failed: number; pending: number };
  by_error_stage: Record<string, number>;
  card_outcomes: { card_created: number; card_enriched: number };
  sources_total: number;
  aggregate_truncated: boolean;
}

export interface AdminRunDetailResponse {
  run: AdminDiscoveryRunRow;
  totals: AdminRunDetailTotals;
  sources: {
    items: AdminDiscoveredSource[];
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export function fetchAdminRunDetail(
  token: string,
  runId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<AdminRunDetailResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<AdminRunDetailResponse>(
    `/api/v1/admin/discovery/runs/${runId}/detail${suffix}`,
    token,
  );
}

// ----------------------------------------------------------------------------
// Recover / reprocess actions
//
// Recover/reprocess/enrich endpoints already exist on the backend; the
// run-debug modal exposes them as buttons. These wrappers send query-string
// params because the backend route signatures default to FastAPI Query()
// params.
// ----------------------------------------------------------------------------

export interface DiscoveryRecoverParams {
  date_start?: string;
  date_end?: string;
}

function buildDiscoveryQuery(params: DiscoveryRecoverParams): string {
  const query = new URLSearchParams();
  if (params.date_start) query.set("date_start", params.date_start);
  if (params.date_end) query.set("date_end", params.date_end);
  return query.toString() ? `?${query.toString()}` : "";
}

export function triggerDiscoveryRecover(
  token: string,
  params: DiscoveryRecoverParams = {},
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/discovery/recover${buildDiscoveryQuery(params)}`,
    token,
    { method: "POST" },
  );
}

export function triggerDiscoveryReprocess(
  token: string,
  params: DiscoveryRecoverParams = {},
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/discovery/reprocess${buildDiscoveryQuery(params)}`,
    token,
    { method: "POST" },
  );
}

export function triggerDiscoveryRecoverAnalyzed(
  token: string,
  params: DiscoveryRecoverParams = {},
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/discovery/recover-analyzed${buildDiscoveryQuery(params)}`,
    token,
    { method: "POST" },
  );
}
