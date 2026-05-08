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
    throw new Error(error.detail || error.message || `API error: ${response.status}`);
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

export function fetchRecentJobs(token: string) {
  return apiRequest<RecentJobsResponse>("/api/v1/admin/jobs/recent", token);
}

export function fetchUsageSummary(token: string, days: number) {
  return apiRequest<UsageSummary>(`/api/v1/admin/usage/summary?days=${days}`, token);
}

export function fetchRecentUsage(token: string, limit = 50) {
  return apiRequest<UsageEvent[]>(`/api/v1/admin/usage/recent?limit=${limit}`, token);
}

export function triggerAdminAction(
  token: string,
  action: "scan" | "velocity" | "quality" | "lens-backfill",
) {
  const endpoints = {
    scan: { endpoint: "/api/v1/admin/scan", body: undefined },
    velocity: { endpoint: "/api/v1/admin/velocity/calculate", body: undefined },
    quality: { endpoint: "/api/v1/admin/quality/recalculate-all", body: undefined },
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
