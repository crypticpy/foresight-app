/**
 * Network helpers for the personal Signals page.
 *
 * Two endpoints power the page now:
 *   - GET /me/signals/stats — cheap counts + workstream list; drives StatsRow
 *     and renders before the feed.
 *   - GET /me/signals       — paginated feed (default page size 30) plus a
 *     full pinned list on the first page. Subsequent pages pass
 *     `include_pinned=false` so the (already-rendered) pinned section isn't
 *     retransmitted.
 *
 * `togglePin` performs the parallel pin+follow toggle and tolerates a 409
 * from the follow endpoint.
 *
 * @module pages/Signals/api
 */

import { getAuthToken } from "../../lib/auth";
import { API_BASE_URL } from "../../lib/config";
import type { MySignalsPage, MySignalsStatsResponse } from "./types";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("You must be signed in to view your signals.");
  }
  return { Authorization: `Bearer ${token}` };
}

function paramsToQuery(
  params: Record<string, string | number | boolean>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.append(k, String(v));
  }
  return qs.toString();
}

export async function fetchSignalsStats(
  params: Record<string, string>,
): Promise<MySignalsStatsResponse> {
  const headers = await authHeaders();
  const qs = paramsToQuery(params);
  const url = `${API_BASE_URL}/api/v1/me/signals/stats${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to load signal stats (${response.status}): ${body}`,
    );
  }
  return response.json();
}

export interface FetchSignalsPageArgs {
  /** Filter / sort params from the FilterBar. */
  params: Record<string, string>;
  /** Pagination offset; 0 for the first page. */
  offset: number;
  /** Page size; defaults to 30 (matches the backend default). */
  limit?: number;
  /** Whether the server should return the pinned set. Only the first page
   * needs it. */
  includePinned: boolean;
}

export async function fetchSignalsPage({
  params,
  offset,
  limit = 30,
  includePinned,
}: FetchSignalsPageArgs): Promise<MySignalsPage> {
  const headers = await authHeaders();
  const qs = paramsToQuery({
    ...params,
    offset,
    limit,
    include_pinned: includePinned,
  });
  const url = `${API_BASE_URL}/api/v1/me/signals${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to load signals (${response.status}): ${body}`);
  }
  return response.json();
}

export async function togglePin(cardId: string, pin: boolean): Promise<void> {
  const headers = {
    ...(await authHeaders()),
    "Content-Type": "application/json",
  };
  // Star = pin AND follow. Pinning surfaces the card in the personal hub;
  // following counts toward the "following" stat and powers digests/related-trends.
  const [pinRes, followRes] = await Promise.all([
    fetch(`${API_BASE_URL}/api/v1/me/signals/${cardId}/pin`, {
      method: "POST",
      headers,
      body: JSON.stringify({ pinned: pin }),
    }),
    fetch(`${API_BASE_URL}/api/v1/cards/${cardId}/follow`, {
      method: pin ? "POST" : "DELETE",
      headers,
    }),
  ]);
  if (!pinRes.ok) throw new Error("Failed to update pin status");
  // Follow may 409 on duplicate insert; that's fine.
  if (!followRes.ok && followRes.status !== 409) {
    throw new Error("Failed to update follow status");
  }
}
