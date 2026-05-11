/**
 * Usage telemetry + LLM audit trail.
 *
 * The audit log keeps a row per LLM call (and a separate row per chat
 * message); the replay endpoint stitches them into a single chronological
 * timeline scoped to one conversation.
 *
 * `downloadLlmAuditExport` uses raw fetch because the response is a CSV/JSON
 * blob, not a JSON object that `apiRequest` could parse.
 *
 * @module lib/admin/usage
 */

import { API_BASE_URL } from "../config";
import { apiRequest } from "./shared";

// ----------------------------------------------------------------------------
// Aggregate usage
// ----------------------------------------------------------------------------

export interface UsageSummary {
  window_days: number;
  llm_totals: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
  };
  llm_by_operation: Record<string, Record<string, number>>;
  llm_by_model: Record<string, Record<string, number>>;
  external_api_totals: {
    calls: number;
    units: number;
    estimated_cost_usd: number;
  };
  external_api_by_provider: Record<string, Record<string, number>>;
}

export interface UsageEvent {
  id?: string;
  operation?: string;
  model?: string;
  total_tokens?: number;
  estimated_cost_usd?: number;
  created_at?: string;
  [key: string]: unknown;
}

export function fetchUsageSummary(
  token: string,
  days: number,
): Promise<UsageSummary> {
  return apiRequest<UsageSummary>(
    `/api/v1/admin/usage/summary?days=${days}`,
    token,
  );
}

export function fetchRecentUsage(
  token: string,
  limit = 50,
): Promise<UsageEvent[]> {
  return apiRequest<UsageEvent[]>(
    `/api/v1/admin/usage/recent?limit=${limit}`,
    token,
  );
}

// ----------------------------------------------------------------------------
// LLM audit events
// ----------------------------------------------------------------------------

export interface LlmAuditEventListItem {
  id: string;
  created_at: string;
  user_id: string | null;
  provider: string | null;
  model: string | null;
  operation: string | null;
  request_kind: string | null;
  status: string | null;
  error_type: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  run_id: string | null;
  task_id: string | null;
  card_id: string | null;
  workstream_id: string | null;
  conversation_id: string | null;
  redaction_flags: string[] | null;
}

export interface LlmAuditEventDetail extends LlmAuditEventListItem {
  prompt_excerpt: string | null;
  response_excerpt: string | null;
  tool_calls: Array<Record<string, unknown>> | null;
  metadata: Record<string, unknown> | null;
  prompt_messages_full_ref: string | null;
}

export interface LlmAuditEventsResponse {
  items: LlmAuditEventListItem[];
  limit: number;
  offset: number;
  next_offset: number | null;
}

export interface LlmAuditEventsParams {
  limit?: number;
  offset?: number;
  operation?: string;
  request_kind?: string;
  user_id?: string;
  model?: string;
  status?: string;
  from?: string;
  to?: string;
  min_cost?: number;
  audited_only?: boolean;
}

export function fetchLlmAuditEvents(
  token: string,
  params: LlmAuditEventsParams = {},
): Promise<LlmAuditEventsResponse> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  const endpoint = `/api/v1/admin/usage/events${qs ? `?${qs}` : ""}`;
  return apiRequest<LlmAuditEventsResponse>(endpoint, token);
}

export function fetchLlmAuditEvent(
  token: string,
  eventId: string,
): Promise<LlmAuditEventDetail> {
  return apiRequest<LlmAuditEventDetail>(
    `/api/v1/admin/usage/events/${encodeURIComponent(eventId)}`,
    token,
  );
}

// ----------------------------------------------------------------------------
// Conversation replay
// ----------------------------------------------------------------------------

export interface LlmAuditReplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: unknown[] | null;
  tokens_used: number | null;
  model: string | null;
  created_at: string;
  conversation_id?: string;
}

export interface LlmAuditReplayConversation {
  id: string;
  user_id: string;
  scope: string;
  scope_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface LlmAuditReplayItem {
  kind: "message" | "llm_event";
  created_at: string;
  data: LlmAuditReplayMessage | LlmAuditEventDetail;
}

export interface LlmAuditReplayResponse {
  conversation: LlmAuditReplayConversation;
  timeline: LlmAuditReplayItem[];
  message_count: number;
  llm_event_count: number;
}

export function fetchLlmAuditReplay(
  token: string,
  conversationId: string,
): Promise<LlmAuditReplayResponse> {
  return apiRequest<LlmAuditReplayResponse>(
    `/api/v1/admin/usage/conversations/${encodeURIComponent(
      conversationId,
    )}/replay`,
    token,
  );
}

// ----------------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------------

export interface LlmAuditExportFilters {
  operation?: string;
  request_kind?: string;
  user_id?: string;
  model?: string;
  status?: string;
  from?: string;
  to?: string;
  min_cost?: number;
  audited_only?: boolean;
  conversation_id?: string;
  format?: "csv" | "json";
  limit?: number;
}

export async function downloadLlmAuditExport(
  token: string,
  filters: LlmAuditExportFilters,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/usage/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(filters),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Export failed" }));
    throw new Error(
      error.detail || error.message || `Export failed: ${response.status}`,
    );
  }
  // Pull the filename out of Content-Disposition; fall back to a sensible
  // default if the header isn't present (e.g. mocked in tests).
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename =
    match?.[1] ??
    `llm-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.${
      filters.format === "json" ? "ndjson" : "csv"
    }`;
  const blob = await response.blob();
  return { blob, filename };
}
