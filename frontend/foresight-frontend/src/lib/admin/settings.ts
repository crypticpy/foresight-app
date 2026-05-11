/**
 * Admin runtime-settings surface: list/update individual flags and apply
 * bundled discovery presets that flip several settings in one step.
 *
 * @module lib/admin/settings
 */

import { apiRequest } from "./shared";

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

export function fetchAdminSettings(
  token: string,
): Promise<AdminSettingsResponse> {
  return apiRequest<AdminSettingsResponse>("/api/v1/admin/settings", token);
}

export function updateAdminSetting(
  token: string,
  key: string,
  value: unknown,
): Promise<AdminSetting> {
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

export function applyDiscoveryPreset(
  token: string,
  preset: DiscoveryPreset,
): Promise<DiscoveryPresetResponse> {
  return apiRequest<DiscoveryPresetResponse>(
    "/api/v1/admin/discovery/preset",
    token,
    {
      method: "POST",
      body: JSON.stringify({ preset }),
    },
  );
}
