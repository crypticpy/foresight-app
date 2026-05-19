import { API_BASE_URL } from "./config";

export interface Tag {
  id: string;
  slug: string;
  label: string;
  created_by: string | null;
  created_at: string;
}

export interface TagOnCard extends Tag {
  count: number;
  applied_by_me: boolean;
}

export interface TagWithUsage extends Tag {
  application_count: number;
  card_count: number;
}

export interface CardTagListResponse {
  tags: TagOnCard[];
}

export interface TagListResponse {
  tags: Tag[];
}

export interface PopularTagsResponse {
  tags: TagWithUsage[];
}

/**
 * Card summary returned inline by `GET /tags/{slug}`. Mirrors the
 * `BaseCard` shape so the tag detail page renders tiles in one
 * round-trip. Personal relationship fields (pinned/followed) are
 * deliberately omitted — the tag page is a global view.
 */
export interface TagDetailCard {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  pillar_id: string | null;
  stage_id: string | null;
  horizon: string | null;
  impact_score: number | null;
  relevance_score: number | null;
  velocity_score: number | null;
  novelty_score: number | null;
  signal_quality_score: number | null;
  velocity_trend: string | null;
  trend_direction: string | null;
  top25_relevance: string[] | null;
  created_at: string;
  updated_at: string | null;
}

export interface TagDetailResponse {
  tag: Tag;
  cards: TagDetailCard[];
  /** Distinct cards that carry this tag, across all pages. */
  total: number;
}

export interface CardTagsBatchResponse {
  // Keyed by card_id (UUID string). Cards with no tags are omitted, so
  // callers must treat missing as empty list.
  tags_by_card: Record<string, TagOnCard[]>;
}

// Soft cap matched to backend models/tag.py — viewer sees their own tags first,
// then alphabetical, up to this many in the compact display.
export const TAG_DISPLAY_LIMIT = 10;

// Mini-view cap for card tiles — fewer chips than the detail panel because
// tiles have far less horizontal room.
export const TAG_MINI_DISPLAY_LIMIT = 3;

// Match the backend cap in models/tag.py. Callers must page above this.
export const TAG_BATCH_CARD_LIMIT = 250;

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

export function searchTags(token: string, query: string, limit = 10) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("limit", String(limit));
  return apiRequest<TagListResponse>(
    `/api/v1/tags?${params.toString()}`,
    token,
  );
}

export function getPopularTags(token: string, limit = 20) {
  return apiRequest<PopularTagsResponse>(
    `/api/v1/tags/popular?limit=${limit}`,
    token,
  );
}

export function getTagDetail(
  token: string,
  slug: string,
  limit = 20,
  offset = 0,
) {
  return apiRequest<TagDetailResponse>(
    `/api/v1/tags/${encodeURIComponent(slug)}?limit=${limit}&offset=${offset}`,
    token,
  );
}

export function getCardTags(token: string, cardId: string) {
  return apiRequest<CardTagListResponse>(
    `/api/v1/cards/${encodeURIComponent(cardId)}/tags`,
    token,
  );
}

export function applyTagToCard(
  token: string,
  cardId: string,
  label: string,
  workstreamId?: string,
) {
  const body: { label: string; workstream_id?: string } = { label };
  if (workstreamId) body.workstream_id = workstreamId;
  return apiRequest<CardTagListResponse>(
    `/api/v1/cards/${encodeURIComponent(cardId)}/tags`,
    token,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function removeTagFromCard(token: string, cardId: string, slug: string) {
  return apiRequest<CardTagListResponse>(
    `/api/v1/cards/${encodeURIComponent(cardId)}/tags/${encodeURIComponent(slug)}`,
    token,
    { method: "DELETE" },
  );
}

/**
 * Hydrate tag chips across a list view in one round-trip. The backend
 * omits cards with no tags from `tags_by_card`, so callers should treat
 * missing keys as empty lists.
 */
export function getCardTagsBatch(token: string, cardIds: string[]) {
  return apiRequest<CardTagsBatchResponse>("/api/v1/cards/tags-batch", token, {
    method: "POST",
    body: JSON.stringify({ card_ids: cardIds }),
  });
}
