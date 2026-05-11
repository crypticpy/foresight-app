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

export function getCardArtifacts(token: string, cardId: string) {
  return apiRequest<CardArtifacts>(`/api/v1/cards/${cardId}/artifacts`, token);
}

// Server-side cap is 250 ids per request (BATCH_CARD_ID_LIMIT in
// card_subresources.py). Chunk at the cap so Discover's full-page result set
// (PostgREST returns up to 1000 rows by default) doesn't 400 the batch lookup.
//
// Chunks are issued sequentially (not Promise.all) to keep concurrent
// in-flight POSTs low for mobile/cellular clients — the caller already
// parallelizes artifacts + followers, so this stays at 2 concurrent fetches
// rather than 2 × ceil(N/250).
const ARTIFACTS_BATCH_SIZE = 250;

export async function getCardsArtifacts(
  token: string,
  cardIds: string[],
): Promise<Record<string, CardArtifacts>> {
  if (cardIds.length === 0) return {};
  const merged: Record<string, CardArtifacts> = {};
  for (let i = 0; i < cardIds.length; i += ARTIFACTS_BATCH_SIZE) {
    const chunk = cardIds.slice(i, i + ARTIFACTS_BATCH_SIZE);
    try {
      const batch = await apiRequest<Record<string, CardArtifacts>>(
        `/api/v1/cards/artifacts`,
        token,
        { method: "POST", body: JSON.stringify({ card_ids: chunk }) },
      );
      Object.assign(merged, batch);
    } catch (err) {
      // Don't drop successfully-fetched batches on a transient failure mid-loop —
      // the caller (hydrateCardCollab) treats the merged map as best-effort
      // decoration, so partial data is better than throwing the whole thing out.
      console.warn(
        `getCardsArtifacts: chunk ${i / ARTIFACTS_BATCH_SIZE} failed, continuing with partial data`,
        err,
      );
    }
  }
  return merged;
}
