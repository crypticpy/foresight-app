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

async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {},
) {
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
      .catch(() => ({ detail: "Request failed" }));
    const err = new Error(
      error.detail || `API error: ${response.status}`,
    ) as Error & {
      status?: number;
    };
    err.status = response.status;
    throw err;
  }
  return response.json() as Promise<T>;
}

export async function listNotifications(
  token: string,
  unreadOnly = false,
): Promise<NotificationItem[]> {
  try {
    return await apiRequest<NotificationItem[]>(
      `/api/v1/me/notifications?unread_only=${unreadOnly ? "true" : "false"}`,
      token,
    );
  } catch (err) {
    // /me/notifications is gated behind FORESIGHT_ENABLE_COLLABORATION; when
    // the flag is off the router returns 404. Treat that as "feature disabled
    // → no notifications" instead of bubbling a console error.
    if ((err as { status?: number })?.status === 404) return [];
    throw err;
  }
}

export async function markNotificationsRead(
  token: string,
  ids?: string[],
): Promise<{ updated: number }> {
  try {
    return await apiRequest<{ updated: number }>(
      "/api/v1/me/notifications/mark-read",
      token,
      {
        method: "POST",
        body: JSON.stringify({ ids }),
      },
    );
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return { updated: 0 };
    throw err;
  }
}
