import { API_BASE_URL } from "./config";

export interface CardFollowerState {
  follower_count: number;
  is_following: boolean;
}

export async function getCardFollowers(
  cardId: string,
  token: string,
): Promise<CardFollowerState> {
  const response = await fetch(`${API_BASE_URL}/api/v1/cards/${cardId}/followers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to load follower state");
  return response.json();
}

export async function followCard(
  cardId: string,
  token: string,
): Promise<CardFollowerState> {
  const response = await fetch(`${API_BASE_URL}/api/v1/cards/${cardId}/follow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to follow signal");
  return response.json();
}

export async function unfollowCard(
  cardId: string,
  token: string,
): Promise<CardFollowerState> {
  const response = await fetch(`${API_BASE_URL}/api/v1/cards/${cardId}/follow`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to unfollow signal");
  return response.json();
}

export async function getCardsFollowerStatus(
  cardIds: string[],
  token: string,
): Promise<Record<string, CardFollowerState>> {
  if (cardIds.length === 0) return {};
  const response = await fetch(`${API_BASE_URL}/api/v1/cards/follower-status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ card_ids: cardIds }),
  });
  if (!response.ok) throw new Error("Failed to load follower states");
  return response.json();
}
