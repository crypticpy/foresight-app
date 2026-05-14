/**
 * Shared types and interfaces for CardDetail components
 *
 * This file contains all the TypeScript interfaces used across the CardDetail
 * component and its sub-components for consistent type safety.
 */

import type { FullCard } from "../../types/card";

/**
 * Card shape used by the CardDetail view.
 *
 * Extends `FullCard` (canonical core + lens metadata) with detail-view
 * extras (description, goal IDs, deep-research provenance) and narrows
 * `updated_at` to required since the detail endpoint always returns it.
 * Narrower trend unions reflect the documented enum values returned by
 * the API.
 */
export interface Card extends Omit<
  FullCard,
  "velocity_trend" | "trend_direction" | "updated_at"
> {
  description: string;
  goal_id: string;
  updated_at: string;
  deep_research_at?: string;
  deep_research_count_today?: number;
  velocity_trend?:
    | "accelerating"
    | "stable"
    | "decelerating"
    | "emerging"
    | "stale"
    | null;
  trend_direction?:
    | "accelerating"
    | "stable"
    | "emerging"
    | "declining"
    | "unknown"
    | null;
}

/**
 * Represents a research task (update or deep research)
 * Used to track async research operations and their results
 */
export interface ResearchTask {
  /** Unique identifier for the task */
  id: string;
  /** Type of research: 'update' for quick refresh, 'deep_research' for comprehensive */
  task_type: "update" | "deep_research";
  /** Current status of the task */
  status: "queued" | "processing" | "completed" | "failed";
  /** Summary of research results (only present when completed) */
  result_summary?: {
    /** Total sources discovered during research */
    sources_found?: number;
    /** Sources that passed relevance filtering */
    sources_relevant?: number;
    /** Sources actually added to the card */
    sources_added?: number;
    /** Card IDs matched during research */
    cards_matched?: string[];
    /** Card IDs created during research */
    cards_created?: string[];
    /** Number of entities extracted */
    entities_extracted?: number;
    /** Estimated API cost for the research */
    cost_estimate?: number;
    /** Full research report text in markdown format */
    report_preview?: string;
  };
  /** Error message if task failed */
  error_message?: string;
  /** ISO timestamp when task was created */
  created_at: string;
  /** ISO timestamp when task completed (if finished) */
  completed_at?: string;
}

/**
 * Represents a source document linked to a card
 * Contains metadata about the source and its relevance
 */
export interface Source {
  /** Unique identifier for the source */
  id: string;
  /** Title of the source document/article */
  title: string;
  /** URL to the source */
  url: string;
  /** AI-generated summary of the source content */
  ai_summary?: string;
  /** Key excerpts extracted from the source */
  key_excerpts?: string[];
  /** Publication name (e.g., journal, website) */
  publication?: string;
  /** Full text content of the source */
  full_text?: string;
  /** Relevance score to the card (1-5 scale) */
  relevance_to_card?: number;
  /** API source that discovered this (e.g., 'gpt_researcher') */
  api_source?: string;
  /** ISO timestamp when the source was ingested */
  ingested_at?: string;
  /** @deprecated Legacy field - use ai_summary instead */
  summary?: string;
  /** @deprecated Legacy field - source type classification */
  source_type?: string;
  /** @deprecated Legacy field - author name */
  author?: string;
  /** @deprecated Legacy field - use publication instead */
  publisher?: string;
  /** @deprecated Legacy field - use ingested_at instead */
  published_date?: string;
  /** @deprecated Legacy field - use relevance_to_card instead (0-100 scale) */
  relevance_score?: number;
}

/**
 * Represents an event in a card's timeline
 * Tracks significant changes, research results, and other activities
 */
export interface TimelineEvent {
  /** Unique identifier for the event */
  id: string;
  /** Type of event (e.g., 'deep_research', 'update', 'created') */
  event_type: string;
  /** Display title for the event */
  title: string;
  /** Description of what happened */
  description: string;
  /** ISO timestamp when the event occurred */
  created_at: string;
  /** Additional metadata specific to the event type */
  metadata?: {
    /** Number of sources found (for research events) */
    sources_found?: number;
    /** Number of relevant sources (for research events) */
    sources_relevant?: number;
    /** Number of sources added (for research events) */
    sources_added?: number;
    /** Number of entities extracted (for research events) */
    entities_extracted?: number;
    /** Cost of the operation (for research events) */
    cost?: number;
    /** Full detailed report in markdown (for deep research events) */
    detailed_report?: string;
  };
}

/**
 * Represents a user note attached to a card
 * Can be public or private to the creating user
 */
export interface Note {
  /** Unique identifier for the note */
  id: string;
  /** Content of the note */
  content: string;
  /** Whether the note is private to the user */
  is_private: boolean;
  /** ISO timestamp when the note was created */
  created_at: string;
}

/**
 * Tab identifiers for CardDetail navigation
 */
export type CardDetailTab =
  | "overview"
  | "research"
  | "sources"
  | "timeline"
  | "notes"
  | "related"
  | "assets"
  | "chat"
  | "discussion";

/**
 * Score color classes for consistent styling across components
 * WCAG 2.1 AA compliant with minimum 4.5:1 contrast ratio
 */
export interface ScoreColorClasses {
  /** Background color class */
  bg: string;
  /** Text color class */
  text: string;
  /** Border color class */
  border: string;
}

/**
 * Metric definition for tooltips and display
 */
export interface MetricDefinition {
  /** Display label for the metric */
  label: string;
  /** Description explaining what the metric measures */
  description: string;
}

/**
 * All available metric keys in the system
 */
export type MetricKey =
  | "impact"
  | "relevance"
  | "velocity"
  | "novelty"
  | "opportunity"
  | "risk";
