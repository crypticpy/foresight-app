import { API_BASE_URL } from "./config";

async function apiRequest<T>(
  endpoint: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || error.message || `API error: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export type WorkstreamRole = "owner" | "editor" | "commenter" | "viewer";
export type AccountType = "paid" | "guest";

export interface WorkstreamMember {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
  role: WorkstreamRole;
  added_by?: string | null;
  created_at?: string | null;
}

export interface WorkstreamInvite {
  id: string;
  workstream_id: string;
  email?: string | null;
  intended_role: Exclude<WorkstreamRole, "owner">;
  intended_account_type: AccountType;
  share_url?: string | null;
  expires_at: string;
  created_at: string;
}

export interface InvitePreview {
  workstream_id: string;
  workstream_name: string;
  inviter_display_name?: string | null;
  inviter_email?: string | null;
  intended_role: string;
  intended_account_type: AccountType;
  email?: string | null;
  expires_at: string;
}

export function listMembers(token: string, workstreamId: string) {
  return apiRequest<WorkstreamMember[]>(
    `/api/v1/me/workstreams/${workstreamId}/members`,
    token,
  );
}

export function addMember(
  token: string,
  workstreamId: string,
  body: { user_email: string; role: Exclude<WorkstreamRole, "owner"> },
) {
  return apiRequest<WorkstreamMember>(
    `/api/v1/me/workstreams/${workstreamId}/members`,
    token,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function updateMemberRole(
  token: string,
  workstreamId: string,
  userId: string,
  role: Exclude<WorkstreamRole, "owner">,
) {
  return apiRequest<WorkstreamMember>(
    `/api/v1/me/workstreams/${workstreamId}/members/${userId}`,
    token,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function removeMember(token: string, workstreamId: string, userId: string) {
  return apiRequest<{ status: string }>(
    `/api/v1/me/workstreams/${workstreamId}/members/${userId}`,
    token,
    { method: "DELETE" },
  );
}

export function leaveWorkstream(token: string, workstreamId: string) {
  return apiRequest<{ status: string }>(
    `/api/v1/me/workstream_memberships/me?workstream_id=${workstreamId}`,
    token,
    { method: "DELETE" },
  );
}

export function createInvite(
  token: string,
  workstreamId: string,
  body: {
    email?: string;
    role: "editor" | "commenter" | "viewer";
    intended_account_type: AccountType;
    expires_in_days?: number;
  },
) {
  return apiRequest<{ invite_id: string; token: string; share_url: string; expires_at: string }>(
    `/api/v1/me/workstreams/${workstreamId}/invites`,
    token,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function listInvites(token: string, workstreamId: string) {
  return apiRequest<WorkstreamInvite[]>(
    `/api/v1/me/workstreams/${workstreamId}/invites`,
    token,
  );
}

export function revokeInvite(token: string, workstreamId: string, inviteId: string) {
  return apiRequest<{ status: string }>(
    `/api/v1/me/workstreams/${workstreamId}/invites/${inviteId}`,
    token,
    { method: "DELETE" },
  );
}

export function previewInvite(tokenValue: string) {
  return apiRequest<InvitePreview>(`/api/v1/invites/${tokenValue}`, null);
}

export function acceptInvite(authToken: string, tokenValue: string) {
  return apiRequest<{ workstream_id: string; role: string; status: string }>(
    `/api/v1/invites/${tokenValue}/accept`,
    authToken,
    { method: "POST" },
  );
}
