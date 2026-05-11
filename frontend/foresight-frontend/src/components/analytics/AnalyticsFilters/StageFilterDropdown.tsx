/**
 * Multi-select dropdown for maturity stages, grouped by horizon
 * (H3 / H2 / H1). Each group's header is tinted with its horizon's
 * accent color, so the user can see at a glance which time window a
 * stage falls into.
 *
 * @module components/analytics/AnalyticsFilters/StageFilterDropdown
 */

import React, { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../../lib/utils";
import { horizons, stages, type MaturityStage } from "../../../data/taxonomy";
import { Dropdown } from "./Dropdown";
import { getHorizonColorClasses } from "./types";

export interface StageFilterDropdownProps {
  selectedStages: number[];
  onToggleStage: (stageNum: number) => void;
  onClearAll: () => void;
  disabled?: boolean;
}

export const StageFilterDropdown: React.FC<StageFilterDropdownProps> = ({
  selectedStages,
  onToggleStage,
  onClearAll,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasSelection = selectedStages.length > 0;

  const stagesByHorizon = useMemo(() => {
    const grouped: Record<string, MaturityStage[]> = { H3: [], H2: [], H1: [] };
    stages.forEach((stage) => {
      grouped[stage.horizon]!.push(stage);
    });
    return grouped;
  }, []);

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <button
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
            "text-sm font-medium",
            hasSelection
              ? "bg-brand-blue/10 border-brand-blue text-brand-blue"
              : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300",
            "hover:bg-gray-50 dark:hover:bg-gray-700",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <span>Stages</span>
          {hasSelection && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-brand-blue text-white text-xs">
              {selectedStages.length}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>
      }
    >
      <div className="flex items-center justify-between px-3 pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Maturity Stages
        </span>
        {hasSelection && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClearAll();
            }}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Clear all
          </button>
        )}
      </div>

      {(["H3", "H2", "H1"] as const).map((horizonCode) => {
        const horizon = horizons.find((h) => h.code === horizonCode);
        const horizonStages = stagesByHorizon[horizonCode] ?? [];
        const colors = getHorizonColorClasses(horizonCode);

        if (horizonStages.length === 0) return null;

        return (
          <div key={horizonCode} className="mb-2">
            <div className={cn("px-3 py-1 text-xs font-medium", colors.text)}>
              {horizon?.name} ({horizon?.timeframe})
            </div>
            {horizonStages.map((stage) => {
              const isSelected = selectedStages.includes(stage.stage);

              return (
                <button
                  key={stage.stage}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStage(stage.stage);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors",
                    "hover:bg-gray-50 dark:hover:bg-gray-700/50",
                    isSelected && colors.bg,
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center w-5 h-5 rounded text-xs font-semibold border",
                      isSelected
                        ? cn(colors.bg, colors.text, "border-current")
                        : "border-gray-300 dark:border-gray-600 text-gray-500",
                    )}
                  >
                    {isSelected ? <Check className="h-3 w-3" /> : stage.stage}
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      isSelected
                        ? colors.text
                        : "text-gray-700 dark:text-gray-300",
                    )}
                  >
                    {stage.name}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </Dropdown>
  );
};
