/**
 * Card-level operations bundled by call site: assets retrieval, signal
 * creation (create-from-topic + keyword suggestions), the personal "My
 * Signals" hub, description/summary version snapshots, and the source
 * preferences shape used across discovery configuration.
 *
 * @module lib/discovery/card-ops
 */

import { apiRequest, type Card } from "./shared";

// ----------------------------------------------------------------------------
// Source preferences (used by signal creation + my-signals)
// ----------------------------------------------------------------------------

export interface SourcePreferences {
  enabled_categories?: string[];
  preferred_type?: string;
  priority_domains?: string[];
  custom_rss_feeds?: string[];
  keywords?: string[];
}

// ----------------------------------------------------------------------------
// Card assets
// ----------------------------------------------------------------------------

/**
 * Asset type enumeration
 */
export type AssetType = "brief" | "research" | "pdf_export" | "pptx_export";

/**
 * Asset data structure returned from the API
 */
export interface CardAsset {
  id: string;
  type: AssetType;
  title: string;
  created_at: string;
  version?: number;
  file_size?: number;
  download_count?: number;
  ai_generated: boolean;
  ai_model?: string;
  status: "ready" | "generating" | "failed";
  metadata?: Record<string, unknown>;
}

/**
 * Response from the card assets endpoint
 */
export interface CardAssetsResponse {
  card_id: string;
  assets: CardAsset[];
  total_count: number;
}

/**
 * Fetch all generated assets for a card.
 *
 * Returns briefs, research reports, and exports associated with the card.
 *
 * @param token - Authentication token
 * @param cardId - Card UUID
 * @returns CardAssetsResponse with list of assets
 */
export function fetchCardAssets(
  token: string,
  cardId: string,
): Promise<CardAssetsResponse> {
  return apiRequest<CardAssetsResponse>(
    `/api/v1/cards/${cardId}/assets`,
    token,
  );
}

// ----------------------------------------------------------------------------
// Signal creation
// ----------------------------------------------------------------------------

export interface CreateCardFromTopicResponse {
  card_id: string;
  card_name: string;
  status: string;
  scan_job_id?: string | null;
  message: string;
}

/**
 * Create a new intelligence card from a topic phrase.
 *
 * The backend uses AI to expand the topic into a fully-formed card with
 * classification, scoring, and initial research context.
 *
 * @param data - Topic string and optional workstream ID
 * @param token - Authentication token
 * @returns The create-from-topic response with card_id, card_name, status, message
 */
export function createCardFromTopic(
  data: { topic: string; workstream_id?: string },
  token: string,
): Promise<CreateCardFromTopicResponse> {
  return apiRequest<CreateCardFromTopicResponse>(
    "/api/v1/cards/create-from-topic",
    token,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

/**
 * Get AI-suggested keywords for a given topic phrase.
 *
 * Returns a list of keyword suggestions that can help refine
 * discovery queries and improve card classification.
 *
 * @param topic - The topic phrase to get keyword suggestions for
 * @param token - Authentication token
 * @returns Object containing an array of suggested keyword strings
 */
export function suggestKeywords(
  topic: string,
  token: string,
): Promise<{ topic: string; suggestions: string[] }> {
  const params = new URLSearchParams();
  params.append("topic", topic);
  return apiRequest<{ topic: string; suggestions: string[] }>(
    `/api/v1/ai/suggest-keywords?${params.toString()}`,
    token,
    { method: "POST" },
  );
}

// ----------------------------------------------------------------------------
// My Signals (Personal Intelligence Hub)
// ----------------------------------------------------------------------------

export interface MySignalCard extends Card {
  is_followed: boolean;
  is_created: boolean;
  is_pinned: boolean;
  personal_notes: string | null;
  follow_priority: string | null;
  followed_at: string | null;
  workstream_names: string[];
  source_preferences?: SourcePreferences;
}

export interface MySignalsStats {
  total: number;
  followed_count: number;
  created_count: number;
  workstream_count: number;
  updates_this_week: number;
  needs_research: number;
}

export interface MySignalsResponse {
  signals: MySignalCard[];
  stats: MySignalsStats;
  workstreams: Array<{ id: string; name: string }>;
}

export function fetchMySignals(
  token: string,
  options?: {
    sort_by?: string;
    search?: string;
    pillar?: string;
    horizon?: string;
    quality_min?: number;
  },
): Promise<MySignalsResponse> {
  const params = new URLSearchParams();
  if (options?.sort_by) params.append("sort_by", options.sort_by);
  if (options?.search) params.append("search", options.search);
  if (options?.pillar) params.append("pillar", options.pillar);
  if (options?.horizon) params.append("horizon", options.horizon);
  if (options?.quality_min !== undefined && options.quality_min > 0)
    params.append("quality_min", String(options.quality_min));

  const queryString = params.toString();
  const endpoint = `/api/v1/me/signals${queryString ? `?${queryString}` : ""}`;
  return apiRequest<MySignalsResponse>(endpoint, token);
}

export function pinSignal(
  token: string,
  cardId: string,
): Promise<{ is_pinned: boolean }> {
  return apiRequest<{ is_pinned: boolean }>(
    `/api/v1/me/signals/${cardId}/pin`,
    token,
    { method: "POST" },
  );
}

// ----------------------------------------------------------------------------
// Card snapshots (description/summary version history)
// ----------------------------------------------------------------------------

export interface CardSnapshot {
  id: string;
  field_name: string;
  content?: string;
  content_length: number;
  trigger: string;
  created_at: string;
  created_by: string;
}

export function fetchCardSnapshots(
  token: string,
  cardId: string,
  fieldName: string = "description",
): Promise<{ snapshots: CardSnapshot[]; card_id: string }> {
  return apiRequest<{ snapshots: CardSnapshot[]; card_id: string }>(
    `/api/v1/cards/${cardId}/snapshots?field_name=${fieldName}`,
    token,
  );
}

export function fetchCardSnapshot(
  token: string,
  cardId: string,
  snapshotId: string,
): Promise<CardSnapshot> {
  return apiRequest<CardSnapshot>(
    `/api/v1/cards/${cardId}/snapshots/${snapshotId}`,
    token,
  );
}

export function restoreCardSnapshot(
  token: string,
  cardId: string,
  snapshotId: string,
): Promise<{ restored: boolean; field_name: string; content_length: number }> {
  return apiRequest<{
    restored: boolean;
    field_name: string;
    content_length: number;
  }>(`/api/v1/cards/${cardId}/snapshots/${snapshotId}/restore`, token, {
    method: "POST",
  });
}
