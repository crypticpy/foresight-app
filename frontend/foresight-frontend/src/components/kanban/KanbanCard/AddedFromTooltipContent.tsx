/**
 * Tooltip body shown when hovering the `added_from` chip on a kanban card.
 * Explains *why* a signal landed in the workstream: auto-matched filter
 * hit, manual add, or follow-driven.
 *
 * @module components/kanban/KanbanCard/AddedFromTooltipContent
 */

import { Heart, Sparkles, UserPlus } from "lucide-react";

import { getPillarByCode } from "../../../data/taxonomy";
import type { WorkstreamCard } from "../types";

export interface AddedFromTooltipContentProps {
  addedFrom: "auto" | "manual" | "follow";
  card: WorkstreamCard["card"];
}

export function AddedFromTooltipContent({
  addedFrom,
  card,
}: AddedFromTooltipContentProps) {
  const pillar = getPillarByCode(card.pillar_id);

  if (addedFrom === "auto") {
    return (
      <div className="space-y-2 min-w-[180px] max-w-[240px]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            Auto-matched
          </span>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          This signal was automatically added because it matched your workstream
          filters:
        </p>
        <div className="space-y-1 text-xs">
          {pillar && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-gray-400">Pillar:</span>
              <span className="text-gray-700 dark:text-gray-300">
                {pillar.name}
              </span>
            </div>
          )}
          {card.horizon && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-gray-400">Horizon:</span>
              <span className="text-gray-700 dark:text-gray-300">
                {card.horizon}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (addedFrom === "manual") {
    return (
      <div className="space-y-2 min-w-[140px]">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            Manually added
          </span>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          You added this signal to your workstream.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 min-w-[140px]">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-pink-500" />
        <span className="font-medium text-gray-900 dark:text-gray-100">
          From followed signal
        </span>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Added because you followed this signal.
      </p>
    </div>
  );
}
