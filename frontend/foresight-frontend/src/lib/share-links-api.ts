import { API_BASE_URL } from "./config";

export interface PublicSharePayload {
  target_type: string;
  target_id: string;
  data: Record<string, unknown>;
  created_by_name?: string | null;
  expires_at?: string | null;
  watermark: string;
}

async function apiRequest<T>(
  endpoint: string,
  token: string | undefined,
  options: RequestInit = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchPublicShare(token: string, authToken?: string) {
  return apiRequest<PublicSharePayload>(`/api/v1/share/${token}`, authToken);
}
