/**
 * Shared types and small helpers for the executive-brief modal. The
 * `ExecutiveBrief` shape mirrors the API response in
 * `lib/workstream-api.ts`; we re-declare it locally so the modal
 * doesn't reach into the API layer for purely-presentation types.
 *
 * @module components/kanban/BriefPreviewModal/types
 */

import type { BriefVersionListItem } from "../../../lib/workstream-api";

/**
 * Executive Brief data structure. Represents the generated brief
 * content and metadata.
 */
export interface ExecutiveBrief {
  /** Unique identifier for the brief */
  id: string;
  /** The card ID this brief is associated with */
  card_id: string;
  /** Title of the brief */
  title: string;
  /** Executive summary - key highlights */
  executive_summary: string;
  /** Full brief content in markdown format */
  content_markdown: string;
  /** When the brief was generated */
  created_at: string;
  /** Version number for tracking revisions */
  version?: number;
  /** Metadata about sources discovered since previous version */
  sources_since_previous?: {
    new_sources_count: number;
    previous_version?: number;
    since_timestamp?: string;
  } | null;
}

/** Props for `BriefPreviewModal`. */
export interface BriefPreviewModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** The executive brief to display, null if not yet loaded */
  brief: ExecutiveBrief | null;
  /** Whether the brief is currently being generated */
  isGenerating: boolean;
  /** Error message if generation failed */
  error: string | null;
  /** Callback to export as PDF */
  onExportPdf: () => void;
  /** Callback to export as PowerPoint */
  onExportPptx: () => void;
  /** Name of the card for display in header */
  cardName: string;
  /** Optional callback to retry generation on error */
  onRetry?: () => void;
  /** List of all brief versions for this card */
  versions?: BriefVersionListItem[];
  /** Number of new sources since last brief */
  newSourcesCount?: number;
  /** Callback to regenerate brief with latest sources */
  onRegenerateBrief?: () => void;
  /** Callback to load a specific version */
  onLoadVersion?: (briefId: string) => void;
  /** Whether versions are currently loading */
  isLoadingVersions?: boolean;
}

/** Format a date string for display in the brief header / footer. */
export function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown date";
  }
}
