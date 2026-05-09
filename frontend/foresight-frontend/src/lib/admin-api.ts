import { API_BASE_URL } from "./config";

async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Request failed" }));
    throw new Error(
      error.detail || error.message || `API error: ${response.status}`,
    );
  }

  return response.json();
}

export interface AdminOverview {
  generated_at: string;
  users: {
    total: number;
    by_account_type: Record<string, number>;
    by_role: Record<string, number>;
  };
  cards: {
    total: number;
    new_last_7d: number;
    by_status: Record<string, number>;
  };
  workstreams: {
    total: number;
    active: number;
    org_owned: number;
    auto_scan: number;
  };
  research_tasks: {
    total_sampled: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
  };
  discovery_runs: {
    recent_count: number;
    by_status: Record<string, number>;
  };
  workstream_scans: {
    recent_count: number;
    by_status: Record<string, number>;
  };
  runtime: Record<string, unknown>;
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string | null;
  account_type: "paid" | "guest" | null;
  department: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
}

export interface AdminSetting {
  key: string;
  group_name: string;
  label: string;
  description?: string | null;
  value_type: "string" | "number" | "boolean" | "json";
  default: unknown;
  env_value: unknown;
  value: unknown;
  has_override: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface AdminSettingsResponse {
  items: AdminSetting[];
}

export interface RecentJobsResponse {
  research_tasks: Array<Record<string, unknown>>;
  discovery_runs: Array<Record<string, unknown>>;
  workstream_scans: Array<Record<string, unknown>>;
}

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

export function fetchAdminOverview(token: string) {
  return apiRequest<AdminOverview>("/api/v1/admin/overview", token);
}

export function fetchAdminUsers(
  token: string,
  params: { search?: string; account_type?: string; role?: string } = {},
) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.account_type) query.set("account_type", params.account_type);
  if (params.role) query.set("role", params.role);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<AdminUsersResponse>(`/api/v1/admin/users${suffix}`, token);
}

export function updateAdminUser(
  token: string,
  userId: string,
  body: Partial<Pick<AdminUser, "role" | "account_type" | "display_name">>,
) {
  return apiRequest<AdminUser>(`/api/v1/admin/users/${userId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchAdminSettings(token: string) {
  return apiRequest<AdminSettingsResponse>("/api/v1/admin/settings", token);
}

export function updateAdminSetting(token: string, key: string, value: unknown) {
  return apiRequest<AdminSetting>(`/api/v1/admin/settings/${key}`, token, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

export type DiscoveryPreset = "conservative" | "balanced" | "aggressive";

export interface DiscoveryPresetResponse {
  preset: DiscoveryPreset;
  items: AdminSetting[];
}

export function applyDiscoveryPreset(token: string, preset: DiscoveryPreset) {
  return apiRequest<DiscoveryPresetResponse>(
    "/api/v1/admin/discovery/preset",
    token,
    {
      method: "POST",
      body: JSON.stringify({ preset }),
    },
  );
}

export type SourceCategory =
  | "rss"
  | "news"
  | "academic"
  | "government"
  | "tech_blog"
  | "web_search";

export interface AdminSource {
  id: string;
  category: SourceCategory;
  name: string;
  url: string | null;
  config: Record<string, unknown>;
  enabled: boolean;
  weight: number;
  notes: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Decorated by the listing endpoint
  items_7d: number;
  passed_7d: number;
  accept_rate_7d: number | null;
  last_discovered_at: string | null;
}

export interface AdminSourcesResponse {
  items: AdminSource[];
  total: number;
}

export interface AdminSourceCategoryMeta {
  key: SourceCategory;
  label: string;
  live: boolean;
  description: string;
}

export interface AdminSourceCategoryResponse {
  items: AdminSourceCategoryMeta[];
}

export function fetchAdminSources(
  token: string,
  params: { category?: SourceCategory; enabledOnly?: boolean } = {},
) {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.enabledOnly) query.set("enabled_only", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<AdminSourcesResponse>(
    `/api/v1/admin/sources${suffix}`,
    token,
  );
}

export function fetchAdminSourceCategories(token: string) {
  return apiRequest<AdminSourceCategoryResponse>(
    "/api/v1/admin/sources/categories",
    token,
  );
}

export interface AdminSourceCreateBody {
  category: SourceCategory;
  name: string;
  url?: string | null;
  config?: Record<string, unknown>;
  enabled?: boolean;
  weight?: number;
  notes?: string | null;
}

export interface AdminSourceUpdateBody {
  name?: string;
  enabled?: boolean;
  weight?: number;
  notes?: string | null;
  config?: Record<string, unknown>;
}

export function createAdminSource(token: string, body: AdminSourceCreateBody) {
  return apiRequest<AdminSource>("/api/v1/admin/sources", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAdminSource(
  token: string,
  sourceId: string,
  body: AdminSourceUpdateBody,
) {
  return apiRequest<AdminSource>(`/api/v1/admin/sources/${sourceId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteAdminSource(token: string, sourceId: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/sources/${sourceId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Delete failed" }));
    throw new Error(
      error.detail || error.message || `API error: ${response.status}`,
    );
  }
}

export function fetchRecentJobs(token: string) {
  return apiRequest<RecentJobsResponse>("/api/v1/admin/jobs/recent", token);
}

export function fetchUsageSummary(token: string, days: number) {
  return apiRequest<UsageSummary>(
    `/api/v1/admin/usage/summary?days=${days}`,
    token,
  );
}

export function fetchRecentUsage(token: string, limit = 50) {
  return apiRequest<UsageEvent[]>(
    `/api/v1/admin/usage/recent?limit=${limit}`,
    token,
  );
}

export interface AdminAuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  before: unknown;
  after: unknown;
  request_ip: string | null;
  created_at: string;
}

export interface AdminAuditResponse {
  items: AdminAuditEntry[];
  total: number;
}

export function fetchAdminAuditLog(
  token: string,
  params: {
    limit?: number;
    offset?: number;
    target_type?: "user" | "setting";
    actor_id?: string;
    since?: string;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.target_type) query.set("target_type", params.target_type);
  if (params.actor_id) query.set("actor_id", params.actor_id);
  if (params.since) query.set("since", params.since);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<AdminAuditResponse>(`/api/v1/admin/audit${suffix}`, token);
}

// ---------------------------------------------------------------------------
// Coverage dashboards (PR C)
// ---------------------------------------------------------------------------

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

export function fetchPillarCoverage(token: string, days: CoverageWindowDays) {
  return apiRequest<PillarCoverageResponse>(
    `/api/v1/admin/coverage/pillars?days=${days}`,
    token,
  );
}

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

export function fetchWorkstreamCoverage(token: string) {
  return apiRequest<WorkstreamCoverageResponse>(
    "/api/v1/admin/coverage/workstreams",
    token,
  );
}

export interface AdminForceScanResponse {
  scan_id: string;
  workstream_id: string;
  status: string;
}

export function adminForceWorkstreamScan(token: string, workstreamId: string) {
  return apiRequest<AdminForceScanResponse>(
    `/api/v1/admin/workstreams/${workstreamId}/scan`,
    token,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// Discovery run detail (PR D)
// ---------------------------------------------------------------------------

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
) {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<AdminRunDetailResponse>(
    `/api/v1/admin/discovery/runs/${runId}/detail${suffix}`,
    token,
  );
}

// Recover/reprocess/enrich endpoints already exist on the backend; the run-debug
// modal exposes them as buttons. These wrappers send query-string params
// because the backend route signatures default to FastAPI Query() params.
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
) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/discovery/recover${buildDiscoveryQuery(params)}`,
    token,
    { method: "POST" },
  );
}

export function triggerDiscoveryReprocess(
  token: string,
  params: DiscoveryRecoverParams = {},
) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/discovery/reprocess${buildDiscoveryQuery(params)}`,
    token,
    { method: "POST" },
  );
}

export function triggerDiscoveryRecoverAnalyzed(
  token: string,
  params: DiscoveryRecoverParams = {},
) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/discovery/recover-analyzed${buildDiscoveryQuery(params)}`,
    token,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// Discovery schedule CRUD (PR E)
// ---------------------------------------------------------------------------

export type SchedulePillar = "CH" | "EW" | "HG" | "HH" | "MC" | "PS";

export interface AdminSchedule {
  id: string;
  name: string;
  enabled: boolean;
  interval_hours: number;
  max_search_queries_per_run: number;
  pillars_to_scan: SchedulePillar[];
  process_rss_first: boolean;
  cron_expression: string | null;
  timezone: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_summary: Record<string, unknown> | null;
  categories_to_scan: SourceCategory[];
  source_ids: string[];
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminSchedulesResponse {
  items: AdminSchedule[];
  total: number;
}

export interface AdminScheduleCreateBody {
  name: string;
  enabled?: boolean;
  interval_hours?: number;
  max_search_queries_per_run?: number;
  pillars_to_scan?: SchedulePillar[];
  process_rss_first?: boolean;
  next_run_at?: string;
  cron_expression?: string | null;
  timezone?: string | null;
  categories_to_scan?: SourceCategory[];
  source_ids?: string[];
  notes?: string | null;
}

export type AdminScheduleUpdateBody = Partial<AdminScheduleCreateBody>;

export function fetchAdminSchedules(token: string) {
  return apiRequest<AdminSchedulesResponse>(
    "/api/v1/admin/discovery/schedules",
    token,
  );
}

export function createAdminSchedule(
  token: string,
  body: AdminScheduleCreateBody,
) {
  return apiRequest<AdminSchedule>("/api/v1/admin/discovery/schedules", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAdminSchedule(
  token: string,
  scheduleId: string,
  body: AdminScheduleUpdateBody,
) {
  return apiRequest<AdminSchedule>(
    `/api/v1/admin/discovery/schedules/${scheduleId}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function deleteAdminSchedule(
  token: string,
  scheduleId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/discovery/schedules/${scheduleId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Delete failed" }));
    throw new Error(
      error.detail || error.message || `API error: ${response.status}`,
    );
  }
}

export function triggerAdminAction(
  token: string,
  action: "scan" | "velocity" | "quality" | "lens-backfill",
) {
  const endpoints = {
    scan: { endpoint: "/api/v1/admin/scan", body: undefined },
    velocity: { endpoint: "/api/v1/admin/velocity/calculate", body: undefined },
    quality: {
      endpoint: "/api/v1/admin/quality/recalculate-all",
      body: undefined,
    },
    "lens-backfill": {
      endpoint: "/api/v1/admin/classify/backfill",
      body: { limit: 100, force: false },
    },
  } as const;
  const config = endpoints[action];
  return apiRequest<Record<string, unknown>>(config.endpoint, token, {
    method: "POST",
    body: config.body ? JSON.stringify(config.body) : undefined,
  });
}

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
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  const endpoint = `/api/v1/admin/usage/events${qs ? `?${qs}` : ""}`;
  return apiRequest<LlmAuditEventsResponse>(endpoint, token);
}

export function fetchLlmAuditEvent(token: string, eventId: string) {
  return apiRequest<LlmAuditEventDetail>(
    `/api/v1/admin/usage/events/${encodeURIComponent(eventId)}`,
    token,
  );
}
