/**
 * Shared Card Type Definitions
 *
 * Canonical card interfaces used across Dashboard, Discover, Signals,
 * and Kanban views. Import from here instead of re-declaring per-page
 * to keep field names (e.g. signal_quality_score) in sync.
 */

/** Technology horizon classification. */
export type Horizon = "H1" | "H2" | "H3";

/** How a card was created. */
export type CardOrigin =
  | "discovery"
  | "user_created"
  | "workstream_scan"
  | "manual";

/** Lens classification: kind of strategic signal. */
export type SignalType = "trend" | "driver" | "signal";

/** Strategic anchor scores (CSP framework). */
export interface AnchorScores {
  equity: number;
  affordability: number;
  innovation: number;
  sustainability_resiliency: number;
  proactive_prevention: number;
  community_trust: number;
}

/** Budget impact assessment from the lens classifier. */
export interface BudgetAssessment {
  relevance: number;
  dimensions: string[];
  magnitude_band: string | null;
  cycle: string | null;
  notes: string | null;
}

/** Climate / sustainability assessment from the lens classifier. */
export interface ClimateAssessment {
  relevance: number;
  drivers: string[];
  horizon: string | null;
  notes: string | null;
}

/** Per-user manual classifier overrides applied on top of LLM output. */
export interface UserMetadata {
  overrides: Record<string, unknown>;
  added: Record<string, string[]>;
  removed: Record<string, string[]>;
}

export interface CardArtifacts {
  has_deep_research: boolean;
  has_brief: boolean;
  has_scan: boolean;
  deep_research_updated_at?: string | null;
  brief_updated_at?: string | null;
  scan_updated_at?: string | null;
  pending_research?: boolean;
}

/**
 * Base card fields shared by every view.
 *
 * Individual pages extend this with view-specific extras
 * (e.g. search_relevance for Discover, personal metadata for Signals).
 */
export interface BaseCard {
  id: string;
  name: string;
  slug: string;
  summary: string;
  pillar_id: string;
  stage_id: string;
  horizon: Horizon;
  novelty_score: number;
  maturity_score: number;
  impact_score: number;
  relevance_score: number;
  velocity_score: number;
  created_at: string;
  updated_at?: string;
  top25_relevance?: string[];
  signal_quality_score?: number | null;
  velocity_trend?: string | null;
  trend_direction?: string | null;
  follower_count?: number;
  is_following?: boolean;
  artifacts?: CardArtifacts;
}

/**
 * Full card with all optional metadata.
 * Used by Discover and Dashboard where `select("*")` returns everything.
 */
export interface FullCard extends BaseCard {
  risk_score: number;
  opportunity_score: number;
  anchor_id?: string;
  search_relevance?: number;
  origin?: CardOrigin;
  is_exploratory?: boolean;
  source_count?: number;
  discovery_metadata?: DiscoveryMetadata;
  // Lens metadata — populated by the classifier cascade. Older cards may
  // have null/empty values until backfilled.
  signal_type?: SignalType | null;
  secondary_pillars?: string[];
  anchor_scores?: AnchorScores | null;
  csp_goal_ids?: string[] | null;
  csp_measure_ids?: string[];
  issue_tags?: string[];
  budget_assessment?: BudgetAssessment | null;
  climate_assessment?: ClimateAssessment | null;
  user_metadata?: UserMetadata | null;
  classifier_version?: string | null;
  classified_at?: string | null;
}

/**
 * Embedded card subset used inside workstream kanban cards.
 * Contains only the fields the kanban UI actually renders.
 */
export interface EmbeddedCard extends BaseCard {
  is_exploratory?: boolean;
}

/**
 * Metadata attached to cards by the discovery pipeline.
 */
export interface DiscoveryMetadata {
  scores_are_defaults?: boolean;
  [key: string]: unknown;
}
