import { API_BASE_URL } from "./config";

export interface NotificationItem {
  id: string;
  kind: string;
  workstream_id?: string | null;
  actor_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  payload: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}

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
    throw new Error(error.detail || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function listNotifications(token: string, unreadOnly = false) {
  return apiRequest<NotificationItem[]>(
    `/api/v1/me/notifications?unread_only=${unreadOnly ? "true" : "false"}`,
    token,
  );
}

export function markNotificationsRead(token: string, ids?: string[]) {
  return apiRequest<{ updated: number }>("/api/v1/me/notifications/mark-read", token, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}
