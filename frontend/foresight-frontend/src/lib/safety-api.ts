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

export type SafetyKind = "injection" | "abuse";
export type SafetySeverity = "low" | "medium" | "high";
export type SafetySource = "discovery" | "chat" | "monitor";
export type SafetyDisposition =
  | "true_positive"
  | "false_positive"
  | "needs_review";

export interface SafetyIncident {
  id: string;
  created_at: string;
  kind: SafetyKind;
  severity: SafetySeverity;
  source: SafetySource;
  user_id: string | null;
  conversation_id: string | null;
  discovered_source_id: string | null;
  pattern_id: string;
  category: string;
  excerpt: string | null;
  metadata: Record<string, unknown>;
  disposition: SafetyDisposition | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface SafetyIncidentsResponse {
  items: SafetyIncident[];
  limit: number;
  offset: number;
  next_offset: number | null;
  open_counts: Record<SafetySeverity, number>;
}

export interface SafetyIncidentsParams {
  kind?: SafetyKind;
  severity?: SafetySeverity;
  source?: SafetySource;
  user_id?: string;
  pattern_id?: string;
  disposition?: SafetyDisposition | "open";
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function fetchSafetyIncidents(
  token: string,
  params: SafetyIncidentsParams = {},
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  const endpoint = `/api/v1/admin/safety/incidents${qs ? `?${qs}` : ""}`;
  return apiRequest<SafetyIncidentsResponse>(endpoint, token);
}

export function fetchSafetyIncident(token: string, incidentId: string) {
  return apiRequest<SafetyIncident>(
    `/api/v1/admin/safety/incidents/${encodeURIComponent(incidentId)}`,
    token,
  );
}

export function updateSafetyIncident(
  token: string,
  incidentId: string,
  payload: { disposition: SafetyDisposition; note?: string },
) {
  return apiRequest<SafetyIncident>(
    `/api/v1/admin/safety/incidents/${encodeURIComponent(incidentId)}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export interface SafetyAbuseScanFinding {
  user_id: string;
  kind: string;
  severity: SafetySeverity;
  description: string;
  metrics: Record<string, unknown>;
}

export interface SafetyAbuseScanResponse {
  window_min: number;
  findings: SafetyAbuseScanFinding[];
  inserted: number;
}

export function runSafetyAbuseScan(token: string, windowMin = 60) {
  return apiRequest<SafetyAbuseScanResponse>(
    `/api/v1/admin/safety/abuse-scan?window_min=${windowMin}`,
    token,
    { method: "POST" },
  );
}
