/**
 * Compact artifact status strip for the kanban card. Renders up to three
 * icon-chip slots — Deep Dive, Brief, Scan — each resolved from
 * `CardArtifacts` into one of: ready / pending / failed. Empty slots are
 * omitted so a bare card stays bare.
 *
 * The strip is the single source of truth on a kanban card for which
 * artifacts exist and which are in flight or failed; the old
 * folder-tab + ribbon + research-pill stack has been retired in its favor.
 *
 * @module components/kanban/KanbanCard/ArtifactStrip
 */

import {
  AlertCircle,
  BookText,
  Compass,
  Loader2,
  Microscope,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { formatDistanceToNow } from "date-fns";

import { cn } from "../../../lib/utils";
import { Tooltip } from "../../ui/Tooltip";
import type { CardArtifacts } from "../../../types/card";

type ArtifactKind = "deep" | "brief" | "scan";
type ArtifactState = "ready" | "pending" | "failed";

interface ArtifactSlot {
  kind: ArtifactKind;
  label: string;
  state: ArtifactState;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  updatedAt?: string | null;
  errorMessage?: string | null;
}

function relativeDate(value?: string | null): string {
  if (!value) return "";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return "";
  }
}

function resolveSlots(artifacts?: CardArtifacts | null): ArtifactSlot[] {
  if (!artifacts) return [];
  const slots: ArtifactSlot[] = [];

  // Deep dive — ready beats pending beats failed (a card can have a
  // completed artifact AND a fresh in-flight retry; show the artifact).
  if (artifacts.has_deep_research) {
    slots.push({
      kind: "deep",
      label: "Deep Dive",
      state: "ready",
      icon: Microscope,
      updatedAt: artifacts.deep_research_updated_at,
    });
  } else if (artifacts.pending_research) {
    slots.push({
      kind: "deep",
      label: "Deep Dive",
      state: "pending",
      icon: Microscope,
    });
  } else if (artifacts.failed_research) {
    slots.push({
      kind: "deep",
      label: "Deep Dive",
      state: "failed",
      icon: Microscope,
      errorMessage: artifacts.research_error_message,
    });
  }

  if (artifacts.has_brief) {
    slots.push({
      kind: "brief",
      label: "Brief",
      state: "ready",
      icon: BookText,
      updatedAt: artifacts.brief_updated_at,
    });
  } else if (artifacts.pending_brief) {
    slots.push({
      kind: "brief",
      label: "Brief",
      state: "pending",
      icon: BookText,
    });
  } else if (artifacts.failed_brief) {
    slots.push({
      kind: "brief",
      label: "Brief",
      state: "failed",
      icon: BookText,
      errorMessage: artifacts.brief_error_message,
    });
  }

  // Scan failures are workstream-level (every card in the workstream would
  // share the same error), so we only surface the ready state here.
  if (artifacts.has_scan) {
    slots.push({
      kind: "scan",
      label: "Scan",
      state: "ready",
      icon: Compass,
      updatedAt: artifacts.scan_updated_at,
    });
  }

  return slots;
}

function slotClasses(state: ArtifactState): string {
  switch (state) {
    case "ready":
      return "border-brand-green/25 bg-brand-green/10 text-brand-green";
    case "pending":
      return "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300";
  }
}

function tooltipBody(slot: ArtifactSlot): React.ReactNode {
  if (slot.state === "pending") {
    return (
      <span>
        <span className="font-medium">{slot.label}</span> in progress…
      </span>
    );
  }
  if (slot.state === "failed") {
    const detail =
      slot.errorMessage?.trim() ||
      "Generation failed. Re-run from the card menu, or contact support if it keeps failing.";
    return (
      <div className="space-y-1">
        <div>
          <span className="font-medium">{slot.label}</span> failed
        </div>
        <div className="text-xs opacity-80">{detail}</div>
      </div>
    );
  }
  const date = relativeDate(slot.updatedAt);
  return (
    <span>
      <span className="font-medium">{slot.label}</span>
      {date && <span className="opacity-80"> · {date}</span>}
    </span>
  );
}

function ariaLabel(slot: ArtifactSlot): string {
  if (slot.state === "pending") return `${slot.label} in progress`;
  if (slot.state === "failed") {
    const detail = slot.errorMessage?.trim();
    return detail ? `${slot.label} failed: ${detail}` : `${slot.label} failed`;
  }
  const date = relativeDate(slot.updatedAt);
  return date ? `${slot.label} ready, updated ${date}` : `${slot.label} ready`;
}

export interface ArtifactStripProps {
  artifacts?: CardArtifacts | null;
  isDragOverlay?: boolean;
}

export function ArtifactStrip({
  artifacts,
  isDragOverlay = false,
}: ArtifactStripProps) {
  const slots = resolveSlots(artifacts);
  if (slots.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1 flex-wrap mb-2"
      role="group"
      aria-label="Artifact status"
    >
      {slots.map((slot) => {
        const Icon = slot.icon;
        const showSpinner = slot.state === "pending";
        return (
          <Tooltip
            key={slot.kind}
            content={tooltipBody(slot)}
            side="top"
            disabled={isDragOverlay}
          >
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5",
                slotClasses(slot.state),
              )}
              role="img"
              aria-label={ariaLabel(slot)}
            >
              {showSpinner ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              {slot.state === "failed" && (
                <AlertCircle className="h-2.5 w-2.5" aria-hidden="true" />
              )}
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
