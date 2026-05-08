import { API_BASE_URL } from "./config";
import type { CardArtifacts } from "../types/card";

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

export function getCardArtifacts(cardId: string, token: string) {
  return apiRequest<CardArtifacts>(`/api/v1/cards/${cardId}/artifacts`, token);
}

export function getCardsArtifacts(
  cardIds: string[],
  token: string,
): Promise<Record<string, CardArtifacts>> {
  if (cardIds.length === 0) return Promise.resolve({});
  return apiRequest<Record<string, CardArtifacts>>(
    `/api/v1/cards/artifacts`,
    token,
    { method: "POST", body: JSON.stringify({ card_ids: cardIds }) },
  );
}
