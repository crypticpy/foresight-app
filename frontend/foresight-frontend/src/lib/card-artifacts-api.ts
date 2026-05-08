import { API_BASE_URL } from "./config";
import type { CardArtifacts } from "../types/card";

export async function getCardArtifacts(
  cardId: string,
  token: string,
): Promise<CardArtifacts> {
  const response = await fetch(`${API_BASE_URL}/api/v1/cards/${cardId}/artifacts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to load artifact state");
  return response.json();
}

export async function getCardsArtifacts(
  cardIds: string[],
  token: string,
): Promise<Record<string, CardArtifacts>> {
  if (cardIds.length === 0) return {};
  const response = await fetch(`${API_BASE_URL}/api/v1/cards/artifacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ card_ids: cardIds }),
  });
  if (!response.ok) throw new Error("Failed to load artifact states");
  return response.json();
}
