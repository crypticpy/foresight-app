/**
 * Admin source-catalog surface: the canonical `SourceCategory` enum (also used
 * by schedules), source CRUD, and the category-metadata endpoint that backs
 * the source-type picker. `deleteAdminSource` uses raw fetch so it can return
 * `void` on 204 — the JSON-parsing `apiRequest` helper would crash there.
 *
 * @module lib/admin/sources
 */

import { API_BASE_URL } from "../config";
import { apiRequest } from "./shared";

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
): Promise<AdminSourcesResponse> {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.enabledOnly) query.set("enabled_only", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<AdminSourcesResponse>(
    `/api/v1/admin/sources${suffix}`,
    token,
  );
}

export function fetchAdminSourceCategories(
  token: string,
): Promise<AdminSourceCategoryResponse> {
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

export function createAdminSource(
  token: string,
  body: AdminSourceCreateBody,
): Promise<AdminSource> {
  return apiRequest<AdminSource>("/api/v1/admin/sources", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAdminSource(
  token: string,
  sourceId: string,
  body: AdminSourceUpdateBody,
): Promise<AdminSource> {
  return apiRequest<AdminSource>(`/api/v1/admin/sources/${sourceId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteAdminSource(
  token: string,
  sourceId: string,
): Promise<void> {
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
