/**
 * Strategic Frameworks API Client
 *
 * Read-only access to the framework taxonomy (frameworks → categories → drivers)
 * introduced by the FY26 reactivation.  See
 * `docs/11_PRD_Scoped_Workstreams_and_Frameworks.md`.
 */

import { API_BASE_URL } from "./config";

// ============================================================================
// Types
// ============================================================================

export interface Driver {
  id: string;
  framework_category_id: string;
  code: string;
  name: string;
  description?: string | null;
  keywords: string[];
  tracked_metric_examples: string[];
  display_order: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FrameworkCategory {
  id: string;
  framework_code: string;
  code: string;
  name: string;
  description?: string | null;
  display_order: number;
  drivers: Driver[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StrategicFramework {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  owner_type: "org" | "user";
  display_order: number;
  categories: FrameworkCategory[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StrategicFrameworkSummary {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  owner_type: "org" | "user";
  display_order: number;
}

// ============================================================================
// API
// ============================================================================

async function get<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ message: "Request failed" }));
    throw new Error(err.message || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function listFrameworks(
  token: string,
): Promise<StrategicFrameworkSummary[]> {
  return get<StrategicFrameworkSummary[]>("/api/v1/frameworks", token);
}

export function getFramework(
  token: string,
  code: string,
): Promise<StrategicFramework> {
  return get<StrategicFramework>(
    `/api/v1/frameworks/${encodeURIComponent(code)}`,
    token,
  );
}
