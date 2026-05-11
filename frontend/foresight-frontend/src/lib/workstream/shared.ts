/**
 * Shared primitives for the workstream API surface: kanban status enums, the
 * card-relationship row, helper grouping logic, and the `apiRequest` fetch
 * helper that every other module in `lib/workstream/` builds on.
 *
 * @module lib/workstream/shared
 */

import { API_BASE_URL } from "../config";
import type { EmbeddedCard } from "../../types/card";

// ----------------------------------------------------------------------------
// Status enums
// ----------------------------------------------------------------------------

/**
 * Valid Kanban stages for workstream cards (v2: collapsed from six to four).
 *
 * - inbox    — untriaged signals waiting for a decision
 * - working  — actively investigating (research running, draft brief, notes)
 * - ready    — a shareable artifact exists (Ready brief or exported deck)
 * - archived — done or dismissed (un-archive restores `previous_status`)
 *
 * "Watching" is now a card attribute (`is_watching`), not a column. See
 * docs/16_PRD_Kanban_Redesign_and_Sharing.md.
 */
export type KanbanStatus = "inbox" | "working" | "ready" | "archived";

/**
 * Brief artifact lifecycle on a workstream card (chip on Working / Ready).
 * Distinct from `BriefStatus` (the brief generation polling response, defined
 * in `./brief`) — this is just the card's own brief-state attribute.
 */
export type CardBriefStatus = "none" | "draft" | "ready" | "exported";

/** Most recent research depth run on a card — drives the freshness badge. */
export type ResearchDepth = "none" | "quick" | "deep";

/**
 * Detailed card information embedded within workstream cards.
 *
 * Aliased to the canonical `EmbeddedCard` type so the kanban component and
 * the API client agree on the shape of `WorkstreamCard.card`.
 */
export type CardDetails = EmbeddedCard;

// ----------------------------------------------------------------------------
// Workstream-card row + grouping
// ----------------------------------------------------------------------------

/**
 * Workstream card representing a card's presence and state within a workstream.
 * Combines the card reference with workstream-specific metadata like status,
 * position, notes, reminders, plus the v2 attributes that used to live in
 * column choices (watching) or be implicit (brief status, freshness).
 */
export interface WorkstreamCard {
  /** Unique identifier for this workstream-card relationship */
  id: string;
  /** UUID of the underlying intelligence card */
  card_id: string;
  /** UUID of the workstream this card belongs to */
  workstream_id: string;
  /** Current Kanban column status */
  status: KanbanStatus;
  /** Position within the column for ordering (lower = higher) */
  position: number;
  /** User notes attached to this card in the workstream */
  notes: string | null;
  /** Optional reminder timestamp (ISO format) */
  reminder_at: string | null;
  /** How the card was added to the workstream */
  added_from: "manual" | "auto" | "follow";
  /** Timestamp when the card was added (ISO format) */
  added_at: string;
  /** Timestamp of last update (ISO format) */
  updated_at: string;
  /** v2: watch flag, orthogonal to status. Notifies on updates regardless of column. */
  is_watching: boolean;
  /** v2: brief artifact state. */
  brief_status: CardBriefStatus;
  /** v2: most recent research depth run on this card. */
  last_research_depth: ResearchDepth;
  /** v2: timestamp of most recent research run (ISO). */
  last_research_at: string | null;
  /** v2: status the card had before being archived (used to restore on un-archive). */
  previous_status: KanbanStatus | null;
  /** Embedded card details for display */
  card: CardDetails;
}

/**
 * Cards grouped by their Kanban stage.
 * Each stage key contains an array of workstream cards for that column.
 */
export interface GroupedWorkstreamCards {
  inbox: WorkstreamCard[];
  working: WorkstreamCard[];
  ready: WorkstreamCard[];
  archived: WorkstreamCard[];
}

/**
 * Response from triggering a deep dive analysis on a card.
 */
export interface DeepDiveResponse {
  /** Unique identifier for the deep dive task */
  id: string;
  /** Current status of the deep dive task */
  status: string;
  /** Type of task (typically 'deep_dive') */
  task_type: string;
}

/**
 * Response from auto-populating a workstream with recommended cards.
 */
export interface AutoPopulateResponse {
  /** Number of cards successfully added */
  added: number;
  /** The newly added workstream cards */
  cards: WorkstreamCard[];
}

// ----------------------------------------------------------------------------
// API helpers
// ----------------------------------------------------------------------------

/**
 * Generic API request helper with authentication and error handling.
 * Follows the established pattern from discovery-api.ts.
 *
 * @param endpoint - API endpoint path (without base URL)
 * @param token - Bearer authentication token
 * @param options - Fetch options (method, body, headers, etc.)
 * @returns Typed response from the API
 * @throws Error with message from API response or generic error
 */
export async function apiRequest<T>(
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
      error.message || error.detail || `API error: ${response.status}`,
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ----------------------------------------------------------------------------
// Client-side grouping
// ----------------------------------------------------------------------------

function createEmptyGroupedCards(): GroupedWorkstreamCards {
  return {
    inbox: [],
    working: [],
    ready: [],
    archived: [],
  };
}

/**
 * Groups an array of workstream cards by their status.
 * Exported for potential client-side grouping needs.
 *
 * @param cards - Array of workstream cards to group
 * @returns Cards grouped by Kanban status
 */
export function groupCardsByStatus(
  cards: WorkstreamCard[],
): GroupedWorkstreamCards {
  const grouped = createEmptyGroupedCards();

  for (const card of cards) {
    if (card.status in grouped) {
      grouped[card.status].push(card);
    }
  }

  // Sort each column by position
  for (const status of Object.keys(grouped) as KanbanStatus[]) {
    grouped[status].sort((a, b) => a.position - b.position);
  }

  return grouped;
}
