/**
 * Collaboration comments client.
 *
 * Backed by `/api/v1/comments*` (routers/comments.py). Endpoints are gated
 * by the `FORESIGHT_ENABLE_COLLABORATION` env flag — when off, every call
 * 404s. Callers should treat that 404 as "feature disabled" rather than
 * "comment missing" and render a graceful empty state.
 *
 * @module lib/comments-api
 */

import { API_BASE_URL } from "./config";

export type CommentTargetType = "card" | "workstream" | "portfolio" | "brief";

export const COMMENT_REACTIONS = [
  "thumbs_up",
  "target",
  "flag",
  "check",
  "question",
] as const;

export type CommentReactionEmoji = (typeof COMMENT_REACTIONS)[number];

export interface CommentItem {
  id: string;
  target_type: CommentTargetType;
  target_id: string;
  workstream_id?: string | null;
  parent_id?: string | null;
  author_id?: string | null;
  author_display_name?: string | null;
  body_markdown: string;
  body_html?: string | null;
  mentions?: string[];
  resolved_at?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  created_at: string;
  reactions: Record<string, number>;
  my_reactions: string[];
}

/**
 * Signals that the collaboration feature flag is off on the server.
 * Catch this to render a graceful "disabled" empty state rather than an
 * error toast — the flag is operational, not user-facing.
 */
export class CommentsDisabledError extends Error {
  constructor() {
    super("Discussion is not enabled on this server");
    this.name = "CommentsDisabledError";
  }
}

/**
 * @param detectDisabled  When true, a 404 with `{"detail": "Not found"}`
 *   (the exact body `feature_flags.require_feature_enabled` raises) is
 *   surfaced as `CommentsDisabledError`. Only callers that operate on a
 *   collection — list / create — should opt in, because for those endpoints
 *   a 404 can only mean "router gated off". Per-resource endpoints
 *   (PATCH / DELETE / reactions on a specific comment id) leave this off so
 *   a real "comment was deleted by someone else" 404 doesn't get
 *   misclassified as "feature disabled".
 */
async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {},
  detectDisabled = false,
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
    const body = await response
      .json()
      .catch(() => ({ detail: `API error: ${response.status}` }));
    if (
      detectDisabled &&
      response.status === 404 &&
      body?.detail === "Not found"
    ) {
      throw new CommentsDisabledError();
    }
    throw new Error(body?.detail ?? `API error: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function listComments(
  token: string,
  targetType: CommentTargetType,
  targetId: string,
  workstreamId?: string,
) {
  const params = new URLSearchParams({
    target_type: targetType,
    target_id: targetId,
  });
  if (workstreamId) params.set("workstream_id", workstreamId);
  return apiRequest<CommentItem[]>(
    `/api/v1/comments?${params.toString()}`,
    token,
    {},
    /* detectDisabled */ true,
  );
}

export function createComment(
  token: string,
  body: {
    target_type: CommentTargetType;
    target_id: string;
    workstream_id?: string;
    body_markdown: string;
    parent_id?: string;
  },
) {
  return apiRequest<CommentItem>(
    "/api/v1/comments",
    token,
    { method: "POST", body: JSON.stringify(body) },
    /* detectDisabled */ true,
  );
}

export function updateComment(
  token: string,
  commentId: string,
  patch: { body_markdown?: string; resolved?: boolean },
) {
  return apiRequest<CommentItem>(`/api/v1/comments/${commentId}`, token, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteComment(token: string, commentId: string) {
  return apiRequest<{ status: string }>(
    `/api/v1/comments/${commentId}`,
    token,
    { method: "DELETE" },
  );
}

export function toggleCommentReaction(
  token: string,
  commentId: string,
  emoji: CommentReactionEmoji,
) {
  return apiRequest<{ status: string }>(
    `/api/v1/comments/${commentId}/reactions`,
    token,
    { method: "POST", body: JSON.stringify({ emoji }) },
  );
}
