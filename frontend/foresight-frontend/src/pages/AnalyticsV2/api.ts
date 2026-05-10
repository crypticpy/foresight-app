/**
 * REST client for the Analytics endpoints. Kept inline rather than promoted
 * into `lib/analytics-api.ts` because no other page currently consumes
 * these shapes.
 *
 * @module pages/AnalyticsV2/api
 */

import { API_BASE_URL } from "../../lib/config";
import type { PersonalStats, SystemWideStats } from "./types";

export async function fetchSystemStats(
  token: string,
): Promise<SystemWideStats> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/analytics/system-stats`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) throw new Error("Failed to fetch system stats");
  return response.json();
}

export async function fetchPersonalStats(
  token: string,
): Promise<PersonalStats> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/analytics/personal-stats`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) throw new Error("Failed to fetch personal stats");
  return response.json();
}
