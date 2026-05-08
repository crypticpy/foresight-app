/**
 * Lens API Client
 *
 * Reads the CSP taxonomy + strategic anchors and writes the per-card
 * `user_metadata` overlay. Backend lives at `app/routers/lens.py`; the
 * full design is in `docs/18_FEATURE_Lens_Architecture.md`.
 *
 * The classifier cascade never overwrites `user_metadata`, so anything
 * written here is durable across re-classification.
 */

import { API_BASE_URL } from "./config";

// ============================================================================
// Vocabularies (mirror backend/app/models/lens.py)
// ============================================================================

export const ANCHOR_CODES = [
  "equity",
  "affordability",
  "innovation",
  "sustainability_resiliency",
  "proactive_prevention",
  "community_trust",
] as const;

export type AnchorCode = (typeof ANCHOR_CODES)[number];

export const ISSUE_TAGS = [
  // People
  "cost_of_living",
  "behavioral_health_homelessness",
  "youth_family_needs",
  "equity_expectations",
  // Place
  "climate_change",
  "aging_infrastructure",
  "energy_transition",
  "housing_landuse_pressure",
  // Partnerships
  "state_federal_preemption",
  "regional_interdependence",
  "grant_funding",
  "civic_trust",
  "economic_competitiveness",
] as const;

export type IssueTag = (typeof ISSUE_TAGS)[number];

export const PILLAR_CODES = ["CH", "EW", "HG", "HH", "MC", "PS"] as const;
export type PillarCode = (typeof PILLAR_CODES)[number];

export const SIGNAL_TYPES = ["trend", "driver", "signal"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

// ============================================================================
// Types
// ============================================================================

export interface StrategicAnchor {
  code: AnchorCode;
  name: string;
  description: string | null;
  display_order: number;
}

export interface CspMeasure {
  id: string;
  code: string;
  name: string;
  initial_target: string | null;
  target_year: number | null;
  display_order: number;
}

export interface CspGoal {
  id: string;
  pillar_code: PillarCode;
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  measures: CspMeasure[];
}

export type AnchorScores = Record<AnchorCode, number>;

export interface UserMetadata {
  /** Scalar/object overrides keyed by field name (e.g. anchor_scores). */
  overrides: Record<string, unknown>;
  /** User-added array values keyed by field name (e.g. issue_tags). */
  added: Record<string, string[]>;
  /** User-removed array values keyed by field name (e.g. issue_tags). */
  removed: Record<string, string[]>;
}

export interface UserMetadataPatch {
  overrides?: Record<string, unknown>;
  added?: Record<string, string[]>;
  removed?: Record<string, string[]>;
}

// ============================================================================
// HTTP helper
// ============================================================================

async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Request failed" }));
    throw new Error(
      error.detail || error.message || `API error: ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============================================================================
// Taxonomy reads
// ============================================================================

export function getStrategicAnchors(token: string): Promise<StrategicAnchor[]> {
  return apiRequest<StrategicAnchor[]>("/api/v1/lens/strategic-anchors", token);
}

export function getCspTaxonomy(token: string): Promise<CspGoal[]> {
  return apiRequest<CspGoal[]>("/api/v1/lens/csp-taxonomy", token);
}

// ============================================================================
// User-metadata writes
// ============================================================================

export function patchUserMetadata(
  token: string,
  cardId: string,
  patch: UserMetadataPatch,
): Promise<UserMetadata> {
  return apiRequest<UserMetadata>(
    `/api/v1/cards/${encodeURIComponent(cardId)}/user-metadata`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

// ============================================================================
// Effective-value helpers (read-time merge of LLM + user layers)
// ============================================================================

/** Apply user added/removed overlays to an LLM-derived array field. */
export function effectiveArray(
  llmValues: string[],
  userMetadata: UserMetadata | null | undefined,
  field: string,
): string[] {
  const removed = new Set(userMetadata?.removed?.[field] ?? []);
  const added = userMetadata?.added?.[field] ?? [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of llmValues) {
    if (!removed.has(v) && !seen.has(v)) {
      out.push(v);
      seen.add(v);
    }
  }
  for (const v of added) {
    if (!removed.has(v) && !seen.has(v)) {
      out.push(v);
      seen.add(v);
    }
  }
  return out;
}

/** Apply per-anchor user overrides on top of LLM-derived scores. */
export function effectiveAnchorScores(
  llmScores: AnchorScores,
  userMetadata: UserMetadata | null | undefined,
): AnchorScores {
  const overrides = (userMetadata?.overrides?.["anchor_scores"] ??
    {}) as Partial<Record<AnchorCode, unknown>>;
  const out = { ...llmScores };
  for (const code of ANCHOR_CODES) {
    if (code in overrides) {
      const raw = overrides[code];
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(n)) {
        out[code] = Math.max(0, Math.min(100, Math.trunc(n)));
      }
    }
  }
  return out;
}
