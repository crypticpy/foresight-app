import { API_BASE_URL } from "./config";

async function apiRequest<T>(endpoint: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || error.message || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface CommentItem {
  id: string;
  target_type: string;
  target_id: string;
  workstream_id?: string | null;
  parent_id?: string | null;
  author_id?: string | null;
  author_display_name?: string | null;
  body_markdown: string;
  body_html?: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reactions: Record<string, number>;
  my_reactions: string[];
}

export function listComments(
  token: string,
  targetType: string,
  targetId: string,
  workstreamId?: string,
) {
  const params = new URLSearchParams({ target_type: targetType, target_id: targetId });
  if (workstreamId) params.set("workstream_id", workstreamId);
  return apiRequest<CommentItem[]>(`/api/v1/comments?${params.toString()}`, token);
}

export function createComment(
  token: string,
  body: {
    target_type: string;
    target_id: string;
    workstream_id?: string;
    body_markdown: string;
    parent_id?: string;
  },
) {
  return apiRequest<CommentItem>("/api/v1/comments", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function toggleCommentReaction(token: string, commentId: string, emoji: string) {
  return apiRequest<{ status: string }>(`/api/v1/comments/${commentId}/reactions`, token, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}
