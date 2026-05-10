/**
 * Shared types + tunables for the DiscoveryQueue page. Kept here so the
 * various sub-modules (`SwipeableCard`, `useUndoStack`, `useDiscoveryHotkeys`,
 * etc.) all agree on shape and timing constants without circular imports.
 *
 * @module pages/DiscoveryQueue/types
 */

import type { DismissReason, PendingCard } from "../../lib/discovery-api";

export interface Pillar {
  id: string;
  name: string;
  color: string;
}

export type ConfidenceFilter = "all" | "high" | "medium" | "low";

export type UndoActionType = "approve" | "reject" | "dismiss" | "defer";

export interface UndoAction {
  type: UndoActionType;
  card: PendingCard;
  timestamp: number;
  dismissReason?: DismissReason;
}

/** Maximum time window (ms) during which an action can be undone. */
export const UNDO_TIMEOUT_MS = 5000;

/** Minimum interval (ms) between keyboard actions to avoid double-fires. */
export const ACTION_DEBOUNCE_MS = 300;
