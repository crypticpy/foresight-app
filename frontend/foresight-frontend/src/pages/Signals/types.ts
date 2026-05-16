/**
 * Shared shapes for the personal Signals page. `PersonalSignal` extends the
 * canonical `FullCard` with the user-relationship flags returned from
 * /api/v1/me/signals.
 *
 * @module pages/Signals/types
 */

import type { FullCard } from "../../types/card";

export interface Signal extends FullCard {
  updated_at: string;
}

export interface PersonalSignal extends Signal {
  is_followed: boolean;
  is_created: boolean;
  is_pinned: boolean;
  personal_notes: string | null;
  follow_priority: string | null;
  followed_at: string | null;
  workstream_names: string[];
}

export interface SignalStats {
  total: number;
  followed_count: number;
  created_count: number;
  workstream_count: number;
  updates_this_week: number;
  needs_research: number;
}

export interface WorkstreamRef {
  id: string;
  name: string;
}

/** Response shape for GET /me/signals (paginated feed). */
export interface MySignalsPage {
  /** This page of the paginated feed. Pinned signals are excluded — they
   * arrive in `pinned` instead so the UI can render them as a stable top
   * section without paginating. */
  signals: PersonalSignal[];
  /** Full pinned list on the first page; `null` on load-more pages where
   * `include_pinned=false` was passed so we don't retransmit. */
  pinned: PersonalSignal[] | null;
  /** Offset to use for the next `loadMore()` call. */
  next_offset: number;
  /** True iff another page exists past `next_offset`. */
  has_more: boolean;
}

/** Response shape for GET /me/signals/stats. */
export interface MySignalsStatsResponse {
  stats: SignalStats;
  workstreams: WorkstreamRef[];
}

export type SourceFilter = "" | "followed" | "created" | "workstream";

export type SortOption =
  | "recently_updated"
  | "date_followed"
  | "quality_desc"
  | "name_asc";

export type GroupBy = "none" | "pillar" | "horizon" | "workstream";

export type ViewMode = "grid" | "list";
