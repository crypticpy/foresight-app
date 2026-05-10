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

export interface MySignalsResponse {
  signals: PersonalSignal[];
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
