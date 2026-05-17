/**
 * Data-access helpers for the WorkstreamFeed page: workstream fetch with an
 * ownership check, the filtered card feed (server filters + client-side
 * keyword matching), follow toggling, and PDF/PPTX export download.
 *
 * @module pages/WorkstreamFeed/api
 */

import { getAuthToken } from "../../lib/auth";
import { API_BASE_URL } from "../../lib/config";
import { supabase } from "../../lib/supabase";
import type { Card, Workstream } from "./types";

export class WorkstreamAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkstreamAccessError";
  }
}

export async function fetchWorkstream(
  id: string,
  userId: string,
): Promise<Workstream> {
  const { data, error } = await supabase
    .from("workstreams")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new WorkstreamAccessError(
      "Failed to load workstream. It may not exist or you may not have access.",
    );
  }
  if (data.user_id !== userId && data.owner_type !== "org") {
    throw new WorkstreamAccessError(
      "You do not have access to this workstream.",
    );
  }
  return data;
}

export interface WorkstreamFeedPage {
  cards: Card[];
  hasMore: boolean;
  nextOffset: number;
}

const DEFAULT_FEED_PAGE_SIZE = 30;

/**
 * Escape a keyword for inclusion in a Supabase PostgREST `.or()` chain.
 * - `%` and `_` are PostgreSQL `LIKE` metachars (Supabase `.ilike` does not
 *   escape them); they would otherwise act as wildcards.
 * - `,` would be parsed as a delimiter between OR branches.
 * - `(` and `)` are reserved by the PostgREST OR-expression grammar.
 * We drop the latter three rather than try to escape them — the workstream
 * keyword field is short user-controlled text and these characters are
 * effectively noise inside a substring match.
 */
function escapeKeywordForOr(raw: string): string {
  return raw.replace(/[%_]/g, " ").replace(/[,()]/g, " ").trim();
}

export async function fetchWorkstreamFeed(
  workstream: Workstream,
  offset = 0,
  limit = DEFAULT_FEED_PAGE_SIZE,
): Promise<WorkstreamFeedPage> {
  let query = supabase.from("cards").select("*").eq("status", "active");

  if (workstream.pillar_ids && workstream.pillar_ids.length > 0) {
    query = query.in("pillar_id", workstream.pillar_ids);
  }
  if (workstream.horizon && workstream.horizon !== "ALL") {
    query = query.eq("horizon", workstream.horizon);
  }
  if (workstream.stage_ids && workstream.stage_ids.length > 0) {
    const stageNumbers = workstream.stage_ids
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n));
    if (stageNumbers.length > 0) {
      query = query.in("stage_id", stageNumbers);
    }
  }

  // Server-side keyword filter via PostgREST `.or()` (previously was an
  // in-memory `.filter()` after fetching every card). For each keyword we
  // require it to match either `name` OR `summary`; across keywords we OR
  // the matches so any keyword hit qualifies the card. The result is one
  // flat OR chain: `name.ilike.%k1%,summary.ilike.%k1%,name.ilike.%k2%,...`
  if (workstream.keywords && workstream.keywords.length > 0) {
    const branches = workstream.keywords
      .map((k) => escapeKeywordForOr(k))
      .filter((k) => k.length > 0)
      .flatMap((k) => [`name.ilike.%${k}%`, `summary.ilike.%${k}%`]);
    if (branches.length > 0) {
      query = query.or(branches.join(","));
    }
  }

  // Over-fetch by 1 row to derive `has_more` without a separate count query.
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) throw new Error(error.message || "Failed to load feed");

  const rows = (data || []) as Card[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { cards: page, hasMore, nextOffset: offset + page.length };
}

export async function fetchFollowedCardIds(
  userId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("card_follows")
    .select("card_id")
    .eq("user_id", userId);
  return new Set((data || []).map((f) => f.card_id));
}

export async function toggleFollow(
  userId: string,
  cardId: string,
  isCurrentlyFollowed: boolean,
): Promise<void> {
  if (isCurrentlyFollowed) {
    await supabase
      .from("card_follows")
      .delete()
      .eq("user_id", userId)
      .eq("card_id", cardId);
  } else {
    await supabase.from("card_follows").insert({
      user_id: userId,
      card_id: cardId,
      priority: "medium",
    });
  }
}

export async function downloadWorkstreamExport(
  workstreamId: string,
  workstreamName: string,
  format: "pdf" | "pptx",
): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new Error("Authentication required");

  const response = await fetch(
    `${API_BASE_URL}/api/v1/workstreams/${workstreamId}/export/${format}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Export failed: ${response.status}`);
  }

  let filename = `${workstreamName.replace(/[^a-zA-Z0-9-_]/g, "_")}.${format}`;
  const contentDisposition = response.headers.get("Content-Disposition");
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
