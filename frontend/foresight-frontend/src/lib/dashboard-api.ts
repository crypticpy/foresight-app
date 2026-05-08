/**
 * Dashboard API client — reads the lens-overview aggregate that powers
 * the dashboard v2 redesign. Backend: `app/routers/analytics.py`
 * (`/api/v1/analytics/lens-overview`).
 */

import { API_BASE_URL } from "./config";
import type { LensOverviewResponse } from "../types/dashboard";

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
      .catch(() => ({ message: "Request failed" }));
    throw new Error(
      error.detail || error.message || `API error: ${response.status}`,
    );
  }

  return response.json();
}

/**
 * Fetch the lens-overview aggregate for the dashboard.
 *
 * @param token Supabase JWT
 * @param days  Sparkline window (7-90, default 14). Backend clamps server-side.
 */
export function fetchLensOverview(
  token: string,
  days: number = 14,
): Promise<LensOverviewResponse> {
  const safeDays = Math.min(90, Math.max(7, Math.trunc(days)));
  return apiRequest<LensOverviewResponse>(
    `/api/v1/analytics/lens-overview?days=${safeDays}`,
    token,
  );
}
