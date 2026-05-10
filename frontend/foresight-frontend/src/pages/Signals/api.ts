/**
 * Network helpers for the personal Signals page. `fetchMySignals` reads the
 * personalised feed; `togglePin` performs the parallel pin+follow toggle and
 * tolerates a 409 from the follow endpoint.
 *
 * @module pages/Signals/api
 */

import { getAuthToken } from "../../lib/auth";
import { API_BASE_URL } from "../../lib/config";
import type { MySignalsResponse } from "./types";

export async function fetchMySignals(
  params: Record<string, string>,
): Promise<MySignalsResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("You must be signed in to view your signals.");
  }
  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE_URL}/api/v1/me/signals?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to load signals (${response.status}): ${body}`);
  }
  return response.json();
}

export async function togglePin(cardId: string, pin: boolean): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new Error("Not authenticated");
  const headers = {
    Authorization: `Bearer ${token}`,
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
