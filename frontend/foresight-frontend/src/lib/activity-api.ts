import { API_BASE_URL } from "./config";

export interface ActivityEvent {
  id: string;
  workstream_id: string;
  actor_id?: string | null;
  actor_display_name?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function listActivity(token: string, workstreamId: string, limit = 50) {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/me/workstreams/${workstreamId}/activity?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
  return response.json() as Promise<ActivityEvent[]>;
}
