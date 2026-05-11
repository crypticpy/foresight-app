import { API_BASE_URL } from "./config";

export interface CardFollowerState {
  follower_count: number;
  is_following: boolean;
}

async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {},
) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getCardFollowers(token: string, cardId: string) {
  return apiRequest<CardFollowerState>(
    `/api/v1/cards/${cardId}/followers`,
    token,
  );
}

export function followCard(token: string, cardId: string) {
  return apiRequest<CardFollowerState>(
    `/api/v1/cards/${cardId}/follow`,
    token,
    { method: "POST" },
  );
}

export function unfollowCard(token: string, cardId: string) {
  return apiRequest<CardFollowerState>(
    `/api/v1/cards/${cardId}/follow`,
    token,
    { method: "DELETE" },
  );
}

// Server-side cap is 250 ids per request (BATCH_CARD_ID_LIMIT in
// card_subresources.py). Chunk at the cap so Discover's full-page result set
// (PostgREST returns up to 1000 rows by default) doesn't 400 the batch lookup.
//
// Chunks are issued sequentially (not Promise.all) to keep concurrent
// in-flight POSTs low for mobile/cellular clients — the caller already
// parallelizes artifacts + followers, so this stays at 2 concurrent fetches
// rather than 2 × ceil(N/250).
const FOLLOWER_BATCH_SIZE = 250;

export async function getCardsFollowerStatus(
  token: string,
  cardIds: string[],
): Promise<Record<string, CardFollowerState>> {
  if (cardIds.length === 0) return {};
  const merged: Record<string, CardFollowerState> = {};
  for (let i = 0; i < cardIds.length; i += FOLLOWER_BATCH_SIZE) {
    const chunk = cardIds.slice(i, i + FOLLOWER_BATCH_SIZE);
    const batch = await apiRequest<Record<string, CardFollowerState>>(
      `/api/v1/cards/follower-status`,
      token,
      { method: "POST", body: JSON.stringify({ card_ids: chunk }) },
    );
    Object.assign(merged, batch);
  }
  return merged;
}
