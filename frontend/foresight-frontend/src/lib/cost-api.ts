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

export interface CostBudgetState {
  enabled: boolean;
  spent_usd: number;
  cap_usd: number | null;
  alert_usd: number | null;
  window_days: number;
  window_start: string;
  reset_after: string | null;
  tripped: boolean;
  alerting: boolean;
  last_alert_at: string | null;
  last_tripped_at: string | null;
}

export function fetchCostBudget(token: string) {
  return apiRequest<CostBudgetState>("/api/v1/admin/cost/budget", token);
}

export function resetCostGuardrail(token: string) {
  return apiRequest<CostBudgetState>("/api/v1/admin/cost/reset", token, {
    method: "POST",
  });
}

export interface CostStatus {
  paused: boolean;
  enabled: boolean;
}

export function fetchCostStatus(token: string) {
  return apiRequest<CostStatus>("/api/v1/cost/status", token);
}
