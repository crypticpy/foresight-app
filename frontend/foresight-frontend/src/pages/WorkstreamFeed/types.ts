/**
 * Local shape overrides for the WorkstreamFeed page. `Workstream` adds the
 * `user_id` field the ownership check needs but that the canonical
 * `Workstream` type intentionally omits; `Card` narrows `stage_id` to a
 * number to match what this page's Supabase query returns.
 *
 * @module pages/WorkstreamFeed/types
 */

import type { BaseCard } from "../../types/card";
import type { Workstream as CanonicalWorkstream } from "../../types/workstream";

export type Workstream = CanonicalWorkstream & { user_id: string };

export type Card = Omit<BaseCard, "stage_id"> & {
  stage_id: number;
  risk_score: number;
  opportunity_score: number;
  top25_priorities?: string[];
};
