/**
 * Shared `apiRequest` helper for admin endpoints. Distinct from the discovery
 * variant in that it surfaces FastAPI's `detail` payload first (most admin
 * endpoints use `HTTPException(detail=...)` rather than `{"message": ...}`).
 *
 * @module lib/admin/shared
 */

import { API_BASE_URL } from "../config";

export async function apiRequest<T>(
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
