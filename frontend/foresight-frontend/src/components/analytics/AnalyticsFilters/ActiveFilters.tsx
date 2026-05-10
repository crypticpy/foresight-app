/**
 * Below-the-toolbar row of "active filter" pills. Each pill shows what
 * is currently filtering the view (pillar code or stage label) and
 * clicking it removes that single filter. A trailing "Clear all"
 * button resets pillar + stage selections together.
 *
 * @module components/analytics/AnalyticsFilters/ActiveFilters
 */

import React from "react";
import { RotateCcw, X } from "lucide-react";
import { cn } from "../../../lib/utils";
import { pillars, stages } from "../../../data/taxonomy";
import {
  getHorizonColorClasses,
  getPillarColorClasses,
  type AnalyticsFiltersState,
} from "./types";

export interface ActiveFiltersProps {
  filters: AnalyticsFiltersState;
  onRemovePillar: (pillarCode: string) => void;
  onRemoveStage: (stageNum: number) => void;
  onClearAll: () => void;
}

export const ActiveFilters: React.FC<ActiveFiltersProps> = ({
  filters,
  onRemovePillar,
  onRemoveStage,
  onClearAll,
}) => {
  const hasActiveFilters =
    filters.selectedPillars.length > 0 || filters.selectedStages.length > 0;

  if (!hasActiveFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      <span className="text-xs text-gray-500 dark:text-gray-400">Active:</span>

      {filters.selectedPillars.map((pillarCode) => {
        const pillar = pillars.find((p) => p.code === pillarCode);
        const colors = getPillarColorClasses(pillarCode);

        return (
          <button
            key={pillarCode}
            onClick={() => onRemovePillar(pillarCode)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
              colors.bg,
              colors.text,
              "hover:opacity-80",
            )}
          >
            {pillar?.code || pillarCode}
            <X className="h-3 w-3" />
          </button>
        );
      })}

      {filters.selectedStages.map((stageNum) => {
        const stage = stages.find((s) => s.stage === stageNum);
        const colors = stage
          ? getHorizonColorClasses(stage.horizon)
          : { bg: "bg-gray-100", text: "text-gray-800" };

        return (
          <button
            key={stageNum}
            onClick={() => onRemoveStage(stageNum)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
              colors.bg,
              colors.text,
              "hover:opacity-80",
            )}
          >
            S{stageNum}: {stage?.name || "Unknown"}
            <X className="h-3 w-3" />
          </button>
        );
      })}

      <button
        onClick={onClearAll}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <RotateCcw className="h-3 w-3" />
        Clear all
      </button>
    </div>
  );
};
