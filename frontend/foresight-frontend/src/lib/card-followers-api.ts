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

export function getCardsFollowerStatus(
  token: string,
  cardIds: string[],
): Promise<Record<string, CardFollowerState>> {
  if (cardIds.length === 0) return Promise.resolve({});
  return apiRequest<Record<string, CardFollowerState>>(
    `/api/v1/cards/follower-status`,
    token,
    { method: "POST", body: JSON.stringify({ card_ids: cardIds }) },
  );
}
