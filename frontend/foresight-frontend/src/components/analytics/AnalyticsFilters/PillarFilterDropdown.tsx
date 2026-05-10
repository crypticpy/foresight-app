/**
 * Multi-select dropdown that lets the user pick which CSP pillars to
 * include in the analytics view. Renders each pillar with its icon,
 * code, and human-readable name, and a "Clear all" affordance.
 *
 * @module components/analytics/AnalyticsFilters/PillarFilterDropdown
 */

import React, { useState } from "react";
import { Check, ChevronDown, Filter } from "lucide-react";
import { cn } from "../../../lib/utils";
import { pillars } from "../../../data/taxonomy";
import { Dropdown } from "./Dropdown";
import { PILLAR_ICONS, getPillarColorClasses } from "./types";

export interface PillarFilterDropdownProps {
  selectedPillars: string[];
  onTogglePillar: (pillarCode: string) => void;
  onClearAll: () => void;
  disabled?: boolean;
}

export const PillarFilterDropdown: React.FC<PillarFilterDropdownProps> = ({
  selectedPillars,
  onTogglePillar,
  onClearAll,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasSelection = selectedPillars.length > 0;

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
          <Filter className="h-4 w-4" />
          <span>Pillars</span>
          {hasSelection && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-brand-blue text-white text-xs">
              {selectedPillars.length}
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
          CSP Pillars
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

      {pillars.map((pillar) => {
        const isSelected = selectedPillars.includes(pillar.code);
        const colors = getPillarColorClasses(pillar.code);
        const Icon = PILLAR_ICONS[pillar.icon];

        return (
          <button
            key={pillar.code}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePillar(pillar.code);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
              "hover:bg-gray-50 dark:hover:bg-gray-700/50",
              isSelected && colors.bg,
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center w-6 h-6 rounded border",
                isSelected
                  ? cn(colors.bg, colors.border, colors.text)
                  : "border-gray-300 dark:border-gray-600",
              )}
            >
              {isSelected && <Check className="h-4 w-4" />}
            </span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {Icon && (
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isSelected ? colors.text : "text-gray-400",
                  )}
                />
              )}
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-sm font-medium truncate",
                    isSelected ? colors.text : "text-gray-900 dark:text-white",
                  )}
                >
                  {pillar.code}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {pillar.name}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </Dropdown>
  );
};
