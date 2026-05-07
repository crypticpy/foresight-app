import { API_BASE_URL } from "./config";

export interface PublicSharePayload {
  target_type: string;
  target_id: string;
  data: Record<string, unknown>;
  watermark: string;
}

export async function fetchPublicShare(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/v1/public/share/${token}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Share not found" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
  return response.json() as Promise<PublicSharePayload>;
}
