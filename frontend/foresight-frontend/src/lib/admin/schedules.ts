/**
 * Discovery schedule CRUD (PR E). `SchedulePillar` is the schedule-only pillar
 * code list; `SourceCategory` is reused from the sources module so a schedule
 * can target a specific subset of categories or sources.
 *
 * @module lib/admin/schedules
 */

import { API_BASE_URL } from "../config";
import { apiRequest } from "./shared";
import type { SourceCategory } from "./sources";

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

export function fetchAdminSchedules(
  token: string,
): Promise<AdminSchedulesResponse> {
  return apiRequest<AdminSchedulesResponse>(
    "/api/v1/admin/discovery/schedules",
    token,
  );
}

export function createAdminSchedule(
  token: string,
  body: AdminScheduleCreateBody,
): Promise<AdminSchedule> {
  return apiRequest<AdminSchedule>("/api/v1/admin/discovery/schedules", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAdminSchedule(
  token: string,
  scheduleId: string,
  body: AdminScheduleUpdateBody,
): Promise<AdminSchedule> {
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
