/**
 * Workstream card CRUD plus per-card actions: list workstreams, fetch grouped
 * cards, add/update/remove, watch toggle, share-payload, bulk action vocabulary,
 * deep-dive trigger, and auto-populate.
 *
 * @module lib/workstream/cards
 */

import {
  apiRequest,
  type AutoPopulateResponse,
  type CardBriefStatus,
  type DeepDiveResponse,
  type GroupedWorkstreamCards,
  type KanbanStatus,
  type WorkstreamCard,
} from "./shared";

// ----------------------------------------------------------------------------
// Workstream listing + per-workstream card fetch
// ----------------------------------------------------------------------------

/**
 * Fetch the caller's workstreams plus all org-owned workstreams.  The
 * backend returns rows with ``owner_type`` set to either "user" or "org",
 * which lets the UI split them into Strategic (org) vs My sections.
 */
export async function listWorkstreams<
  T = Record<string, unknown> & { owner_type?: "user" | "org" },
>(token: string): Promise<T[]> {
  return apiRequest<T[]>("/api/v1/me/workstreams", token);
}

/**
 * Fetches all cards in a workstream, grouped by Kanban status.
 * Cards within each status group are sorted by position.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @returns Cards grouped by status for Kanban display
 *
 * @example
 * ```typescript
 * const grouped = await fetchWorkstreamCards(token, workstreamId);
 * console.log(`${grouped.inbox.length} cards in inbox`);
 * ```
 */
export async function fetchWorkstreamCards(
  token: string,
  workstreamId: string,
): Promise<GroupedWorkstreamCards> {
  // Backend returns already grouped response
  const response = await apiRequest<GroupedWorkstreamCards>(
    `/api/v1/me/workstreams/${workstreamId}/cards`,
    token,
  );

  // Ensure all stage keys exist with proper defaults.
  return {
    inbox: response.inbox || [],
    working: response.working || [],
    ready: response.ready || [],
    archived: response.archived || [],
  };
}

// ----------------------------------------------------------------------------
// Single-card mutations
// ----------------------------------------------------------------------------

/**
 * Adds a card to a workstream with optional initial status and notes.
 * The card will be added to the specified status column (defaults to 'inbox')
 * at the end of the column's card list.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @param cardId - UUID of the card to add
 * @param status - Initial Kanban status (defaults to 'inbox')
 * @param notes - Optional notes to attach to the card
 * @returns The newly created workstream card
 *
 * @example
 * ```typescript
 * const card = await addCardToWorkstream(token, wsId, cardId, 'working', 'Review this week');
 * ```
 */
export async function addCardToWorkstream(
  token: string,
  workstreamId: string,
  cardId: string,
  status?: KanbanStatus,
  notes?: string,
): Promise<WorkstreamCard> {
  const body: Record<string, unknown> = { card_id: cardId };

  if (status !== undefined) {
    body.status = status;
  }

  if (notes !== undefined) {
    body.notes = notes;
  }

  return apiRequest<WorkstreamCard>(
    `/api/v1/me/workstreams/${workstreamId}/cards`,
    token,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

/**
 * Updates a workstream card's properties.
 * Supports updating status (moving between columns), position (reordering),
 * notes, and reminder settings.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @param cardId - UUID of the workstream card (not the underlying card)
 * @param updates - Object containing fields to update
 * @returns The updated workstream card
 *
 * @example
 * ```typescript
 * // Move card to working column at position 0
 * const updated = await updateWorkstreamCard(token, wsId, cardId, {
 *   status: 'working',
 *   position: 0
 * });
 *
 * // Add a reminder for next week
 * const withReminder = await updateWorkstreamCard(token, wsId, cardId, {
 *   reminder_at: '2024-02-01T09:00:00Z'
 * });
 * ```
 */
export async function updateWorkstreamCard(
  token: string,
  workstreamId: string,
  cardId: string,
  updates: {
    status?: KanbanStatus;
    position?: number;
    notes?: string;
    reminder_at?: string | null;
    is_watching?: boolean;
    brief_status?: CardBriefStatus;
  },
): Promise<WorkstreamCard> {
  return apiRequest<WorkstreamCard>(
    `/api/v1/me/workstreams/${workstreamId}/cards/${cardId}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );
}

/**
 * Toggle the watch flag on a workstream card. When `is_watching` is true the
 * card is monitored for updates regardless of stage; orthogonal to status.
 */
export async function setWorkstreamCardWatching(
  token: string,
  workstreamId: string,
  cardId: string,
  isWatching: boolean,
): Promise<WorkstreamCard> {
  return apiRequest<WorkstreamCard>(
    `/api/v1/me/workstreams/${workstreamId}/cards/${cardId}/watching`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ is_watching: isWatching }),
    },
  );
}

/**
 * Removes a card from a workstream.
 * This removes the card from the user's workstream view but does not
 * delete the underlying intelligence card.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @param cardId - UUID of the workstream card to remove
 *
 * @example
 * ```typescript
 * await removeCardFromWorkstream(token, workstreamId, cardId);
 * ```
 */
export async function removeCardFromWorkstream(
  token: string,
  workstreamId: string,
  cardId: string,
): Promise<void> {
  return apiRequest<void>(
    `/api/v1/me/workstreams/${workstreamId}/cards/${cardId}`,
    token,
    {
      method: "DELETE",
    },
  );
}

// ----------------------------------------------------------------------------
// Share payload
// ----------------------------------------------------------------------------

/**
 * Server-rendered email payload for a workstream card. The frontend opens
 * `mailto:` with this subject/body, so the wording stays consistent across
 * surfaces.
 */
export interface SharePayloadResponse {
  subject: string;
  body: string;
  url: string;
}

export async function fetchWorkstreamCardSharePayload(
  token: string,
  workstreamId: string,
  cardId: string,
): Promise<SharePayloadResponse> {
  return apiRequest<SharePayloadResponse>(
    `/api/v1/me/workstreams/${workstreamId}/cards/${cardId}/share-payload`,
    token,
    {
      method: "GET",
      headers: {
        "x-foresight-frontend-url": window.location.origin,
      },
    },
  );
}

// ----------------------------------------------------------------------------
// Bulk action
// ----------------------------------------------------------------------------

/** Bulk-action vocabulary supported by `POST /workstreams/{id}/bulk`. */
export type BulkCardAction =
  | "archive"
  | "restore"
  | "watch"
  | "unwatch"
  | "set_status"
  | "set_brief_status"
  | "copy_share_links"
  | "email_selection"
  | "rerun_research"
  | "generate_portfolio"
  | "generate_combined_memo"
  | "export_raw";

export interface BulkCardActionResponse {
  /** Number of cards affected (mutating actions only). */
  updated?: number;
  action?: BulkCardAction;
  /** copy_share_links / email_selection results. */
  urls?: string[];
  subject?: string;
  body?: string;
  status?: KanbanStatus;
  brief_status?: CardBriefStatus;
  is_watching?: boolean;
}

export async function bulkWorkstreamCardAction(
  token: string,
  workstreamId: string,
  action: BulkCardAction,
  cardIds: string[],
  params?: Record<string, unknown>,
): Promise<BulkCardActionResponse> {
  return apiRequest<BulkCardActionResponse>(
    `/api/v1/me/workstreams/${workstreamId}/bulk`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ action, card_ids: cardIds, params }),
    },
  );
}

// ----------------------------------------------------------------------------
// Deep dive + auto-populate
// ----------------------------------------------------------------------------

/**
 * Triggers a deep dive analysis on a card.
 * Initiates an async background task that performs in-depth research
 * and analysis on the specified card, enriching its data.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @param cardId - UUID of the workstream card to analyze
 * @returns Deep dive task information including task ID and status
 *
 * @example
 * ```typescript
 * const task = await triggerDeepDive(token, wsId, cardId);
 * console.log(`Deep dive task ${task.id} started with status: ${task.status}`);
 * ```
 */
export async function triggerDeepDive(
  token: string,
  workstreamId: string,
  cardId: string,
): Promise<DeepDiveResponse> {
  return apiRequest<DeepDiveResponse>(
    `/api/v1/me/workstreams/${workstreamId}/cards/${cardId}/deep-dive`,
    token,
    {
      method: "POST",
    },
  );
}

/**
 * Auto-populates a workstream with recommended cards.
 * Uses the workstream's configuration (pillars, goals, filters) to
 * find and add relevant cards automatically to the inbox.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @param limit - Maximum number of cards to add (optional, uses server default)
 * @returns Number of cards added and the newly added workstream cards
 *
 * @example
 * ```typescript
 * const result = await autoPopulateWorkstream(token, wsId, 10);
 * console.log(`Added ${result.added} cards to the workstream`);
 * ```
 */
export async function autoPopulateWorkstream(
  token: string,
  workstreamId: string,
  limit?: number,
): Promise<AutoPopulateResponse> {
  const body: Record<string, unknown> = {};

  if (limit !== undefined) {
    body.limit = limit;
  }

  return apiRequest<AutoPopulateResponse>(
    `/api/v1/me/workstreams/${workstreamId}/auto-populate`,
    token,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}
