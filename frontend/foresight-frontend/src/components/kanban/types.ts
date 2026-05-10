/**
 * Kanban Types and Column Definitions (v2)
 *
 * Four stages — inbox / working / ready / archived — that map to one
 * question each: "what do I need to look at next?" Watching, brief-status,
 * and research-freshness are now card *attributes* (chips), not stages.
 *
 * See docs/16_PRD_Kanban_Redesign_and_Sharing.md.
 */

import type { LucideIcon } from "lucide-react";
import type { CardBriefStatus, ResearchDepth } from "../../lib/workstream-api";
import type { EmbeddedCard } from "../../types/card";

export type { EmbeddedCard, CardBriefStatus, ResearchDepth };

// =============================================================================
// Status and Column Types
// =============================================================================

/** Four-stage kanban vocabulary. */
export type KanbanStatus = "inbox" | "working" | "ready" | "archived";

export type AddedFrom = "manual" | "auto" | "follow";

export interface CardResearchStatus {
  status: "queued" | "processing" | "completed" | "failed" | null;
  task_type?: "quick_update" | "deep_research";
  task_id?: string;
  started_at?: string;
  completed_at?: string;
}

export interface WorkstreamCard {
  /** workstream_card junction id */
  id: string;
  card_id: string;
  workstream_id: string;
  status: KanbanStatus;
  position: number;
  notes: string | null;
  reminder_at: string | null;
  added_from: AddedFrom;
  research_status?: CardResearchStatus;
  review_status?: "pending_review" | "approved" | "rejected" | null;
  added_at: string;
  updated_at: string;
  /** v2 attributes — orthogonal to stage. */
  is_watching: boolean;
  brief_status: CardBriefStatus;
  last_research_depth: ResearchDepth;
  last_research_at: string | null;
  previous_status: KanbanStatus | null;
  card: EmbeddedCard;
}

// =============================================================================
// Column Configuration
// =============================================================================

export interface KanbanColumnDefinition {
  id: KanbanStatus;
  title: string;
  description: string;
  /** Column-level icon (rendered in the header). */
  icon?: LucideIcon;
  emptyStateHint?: string;
}

export interface KanbanColumn {
  id: KanbanStatus;
  title: string;
  description: string;
  cards: WorkstreamCard[];
}

/**
 * Static column definitions. Stage-specific actions are gone — the toolbar
 * (selection-driven) and the per-card menu now own all actions.
 */
export const KANBAN_COLUMNS: KanbanColumnDefinition[] = [
  {
    id: "inbox",
    title: "Inbox",
    description: "Untriaged signals — decide what's worth investigating.",
    emptyStateHint:
      "New signals matching your filters land here. Triage with ✓ / ✗ / 👁 or keyboard shortcuts.",
  },
  {
    id: "working",
    title: "Working",
    description: "Actively investigating.",
    emptyStateHint: "Run research on an Inbox signal and it'll move here.",
  },
  {
    id: "ready",
    title: "Ready",
    description: "A shareable artifact exists.",
    emptyStateHint:
      "Generate a brief and mark it Ready, or export, to land cards here.",
  },
  {
    id: "archived",
    title: "Archived",
    description: "Done or dismissed.",
    emptyStateHint:
      "Archived cards live here. Restore returns them to Working.",
  },
];

// =============================================================================
// Callback Types
// =============================================================================

export type OnCardMoveCallback = (
  cardId: string,
  newStatus: KanbanStatus,
  newPosition: number,
) => void;

export type OnCardClickCallback = (card: WorkstreamCard) => void;
export type OnNotesUpdateCallback = (cardId: string, notes: string) => void;
export type OnDeepDiveCallback = (cardId: string) => void;
export type OnRemoveCardCallback = (cardId: string) => void;
export type OnMoveToColumnCallback = (
  cardId: string,
  status: KanbanStatus,
) => void;
export type OnQuickUpdateCallback = (cardId: string) => Promise<unknown>;
export type OnExportCallback = (
  cardId: string,
  format: "pdf" | "pptx",
) => Promise<unknown>;
export type OnCheckUpdatesCallback = (cardId: string) => Promise<void>;
export type OnGenerateBriefCallback = (
  workstreamCardId: string,
  cardId: string,
) => void;

/** v2 callbacks (sharing, watching toggle, selection). */
export type OnToggleWatchingCallback = (
  cardId: string,
  isWatching: boolean,
) => Promise<void> | void;
export type OnShareCardCallback = (cardId: string) => Promise<void> | void;
export type OnCopyShareLinkCallback = (cardId: string) => Promise<void> | void;

/**
 * IMPORTANT: All `cardId` parameters refer to WorkstreamCard.id (the junction
 * table id), NOT the underlying card UUID.
 */
export interface CardActionCallbacks {
  onNotesUpdate: OnNotesUpdateCallback;
  onDeepDive: OnDeepDiveCallback;
  onRemove: OnRemoveCardCallback;
  onMoveToColumn: OnMoveToColumnCallback;
  onQuickUpdate?: OnQuickUpdateCallback;
  onExport?: OnExportCallback;
  onExportBrief?: OnExportCallback;
  onCheckUpdates?: OnCheckUpdatesCallback;
  onGenerateBrief?: OnGenerateBriefCallback;
  onApproveReview?: (cardId: string) => void;
  /** v2: toggle is_watching on a card. */
  onToggleWatching?: OnToggleWatchingCallback;
  /** v2: open the user's email client with a single-card share payload. */
  onShareCard?: OnShareCardCallback;
  /** v2: copy a public share URL for the card to the clipboard. */
  onCopyShareLink?: OnCopyShareLinkCallback;
}
