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
