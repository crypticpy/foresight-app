/**
 * Research-status surface: types and the GET endpoint that returns active /
 * recently-completed research tasks for cards in a workstream.
 *
 * @module lib/workstream/research
 */

import { apiRequest } from "./shared";

/**
 * Research status for a card in a workstream.
 */
export interface WorkstreamResearchStatus {
  /** UUID of the underlying card */
  card_id: string;
  /** UUID of the research task */
  task_id: string;
  /** Type of research (quick_update, deep_research) */
  task_type: "quick_update" | "deep_research";
  /** Task status */
  status: "queued" | "processing" | "completed" | "failed";
  /** When research started */
  started_at?: string;
  /** When research completed */
  completed_at?: string;
}

/**
 * Response containing active research tasks for workstream cards.
 */
export interface WorkstreamResearchStatusResponse {
  tasks: WorkstreamResearchStatus[];
}

/**
 * Fetches active research tasks for cards in a workstream.
 * Returns queued/processing tasks and recently completed tasks (last hour).
 * Used to show research progress indicators on kanban cards.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @returns Research status for cards with active or recent tasks
 *
 * @example
 * ```typescript
 * const { tasks } = await fetchResearchStatus(token, wsId);
 * tasks.forEach(t => console.log(`Card ${t.card_id}: ${t.status}`));
 * ```
 */
export async function fetchResearchStatus(
  token: string,
  workstreamId: string,
): Promise<WorkstreamResearchStatusResponse> {
  return apiRequest<WorkstreamResearchStatusResponse>(
    `/api/v1/me/workstreams/${workstreamId}/research-status`,
    token,
  );
}
