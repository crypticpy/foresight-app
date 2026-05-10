/**
 * Admin user management: list, search, role/account_type updates, and the
 * paginated audit log (which mostly reflects user/setting mutations).
 *
 * @module lib/admin/users
 */

import { apiRequest } from "./shared";

// ----------------------------------------------------------------------------
// Users
// ----------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string | null;
  account_type: "paid" | "guest" | null;
  department: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
}

export function fetchAdminUsers(
  token: string,
  params: { search?: string; account_type?: string; role?: string } = {},
): Promise<AdminUsersResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.account_type) query.set("account_type", params.account_type);
  if (params.role) query.set("role", params.role);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<AdminUsersResponse>(`/api/v1/admin/users${suffix}`, token);
}

export function updateAdminUser(
  token: string,
  userId: string,
  body: Partial<Pick<AdminUser, "role" | "account_type" | "display_name">>,
): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/v1/admin/users/${userId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ----------------------------------------------------------------------------
// Audit log
// ----------------------------------------------------------------------------

export interface AdminAuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  before: unknown;
  after: unknown;
  request_ip: string | null;
  created_at: string;
}

export interface AdminAuditResponse {
  items: AdminAuditEntry[];
  total: number;
}

export function fetchAdminAuditLog(
  token: string,
  params: {
    limit?: number;
    offset?: number;
    target_type?: "user" | "setting";
    actor_id?: string;
    since?: string;
  } = {},
): Promise<AdminAuditResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.target_type) query.set("target_type", params.target_type);
  if (params.actor_id) query.set("actor_id", params.actor_id);
  if (params.since) query.set("since", params.since);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<AdminAuditResponse>(`/api/v1/admin/audit${suffix}`, token);
}
