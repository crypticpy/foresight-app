/**
 * Admin overview surface: top-of-console dashboard stats, recent-jobs panel,
 * and the umbrella `triggerAdminAction` switch used by manual operations
 * (scan, velocity recompute, quality recompute, lens backfill).
 *
 * @module lib/admin/overview
 */

import { apiRequest } from "./shared";

export interface AdminOverview {
  generated_at: string;
  users: {
    total: number;
    by_account_type: Record<string, number>;
    by_role: Record<string, number>;
  };
  cards: {
    total: number;
    new_last_7d: number;
    by_status: Record<string, number>;
  };
  workstreams: {
    total: number;
    active: number;
    org_owned: number;
    auto_scan: number;
  };
  research_tasks: {
    total_sampled: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
  };
  discovery_runs: {
    recent_count: number;
    by_status: Record<string, number>;
  };
  workstream_scans: {
    recent_count: number;
    by_status: Record<string, number>;
  };
  runtime: Record<string, unknown>;
}

export interface RecentJobsResponse {
  research_tasks: Array<Record<string, unknown>>;
  discovery_runs: Array<Record<string, unknown>>;
  workstream_scans: Array<Record<string, unknown>>;
}

export function fetchAdminOverview(token: string): Promise<AdminOverview> {
  return apiRequest<AdminOverview>("/api/v1/admin/overview", token);
}

export function fetchRecentJobs(token: string): Promise<RecentJobsResponse> {
  return apiRequest<RecentJobsResponse>("/api/v1/admin/jobs/recent", token);
}

export type AdminAction =
  | "scan"
  | "velocity"
  | "quality"
  | "lens-backfill"
  | "embeddings-backfill";

export function triggerAdminAction(
  token: string,
  action: AdminAction,
): Promise<Record<string, unknown>> {
  const endpoints = {
    scan: { endpoint: "/api/v1/admin/scan", body: undefined },
    velocity: { endpoint: "/api/v1/admin/velocity/calculate", body: undefined },
    quality: {
      endpoint: "/api/v1/admin/quality/recalculate-all",
      body: undefined,
    },
    "lens-backfill": {
      endpoint: "/api/v1/admin/classify/backfill",
      body: { limit: 100, force: false },
    },
    "embeddings-backfill": {
      endpoint: "/api/v1/admin/embeddings/backfill",
      body: { target: "both", limit: 2000, concurrency: 3 },
    },
  } as const;
  const config = endpoints[action];
  return apiRequest<Record<string, unknown>>(config.endpoint, token, {
    method: "POST",
    body: config.body ? JSON.stringify(config.body) : undefined,
  });
}
