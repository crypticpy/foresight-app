/**
 * Top-of-page filter toolbar for the analytics dashboard. Wires the
 * pillar, stage, and time-range dropdowns plus the active-filter chip
 * row, lifting all state up to the caller via `onFiltersChange` so the
 * filters can be shared across the page's visualizations.
 *
 * State and rendering for each dropdown live in the focused sub-modules
 * under `./AnalyticsFilters/`. This file owns layout and the callback
 * handlers that translate user actions back into immutable updates of
 * the `AnalyticsFiltersState`.
 *
 * @module components/analytics/AnalyticsFilters
 */

import React, { useCallback } from "react";
import { cn } from "../../lib/utils";

import {
  DEFAULT_ANALYTICS_FILTERS,
  getDateRangeFromPreset,
  type AnalyticsFiltersState,
  type TimeRangePreset,
} from "./AnalyticsFilters/types";
import { PillarFilterDropdown } from "./AnalyticsFilters/PillarFilterDropdown";
import { StageFilterDropdown } from "./AnalyticsFilters/StageFilterDropdown";
import { TimeRangeFilter } from "./AnalyticsFilters/TimeRangeFilter";
import { ActiveFilters } from "./AnalyticsFilters/ActiveFilters";

export type { AnalyticsFiltersState, TimeRangePreset };
export { DEFAULT_ANALYTICS_FILTERS, getDateRangeFromPreset };

export interface AnalyticsFiltersProps {
  /** Current filter state */
  filters: AnalyticsFiltersState;
  /** Called when filters change */
  onFiltersChange: (filters: AnalyticsFiltersState) => void;
  /** Whether to show compact version */
  compact?: boolean;
  /** Additional className */
  className?: string;
  /** Disable filters (e.g., while loading) */
  disabled?: boolean;
}

export const AnalyticsFilters: React.FC<AnalyticsFiltersProps> = ({
  filters,
  onFiltersChange,
  compact = false,
  className,
  disabled = false,
}) => {
  const handleTogglePillar = useCallback(
    (pillarCode: string) => {
      const newSelection = filters.selectedPillars.includes(pillarCode)
        ? filters.selectedPillars.filter((p) => p !== pillarCode)
        : [...filters.selectedPillars, pillarCode];
      onFiltersChange({ ...filters, selectedPillars: newSelection });
    },
    [filters, onFiltersChange],
  );

  const handleClearPillars = useCallback(() => {
    onFiltersChange({ ...filters, selectedPillars: [] });
  }, [filters, onFiltersChange]);

  const handleToggleStage = useCallback(
    (stageNum: number) => {
      const newSelection = filters.selectedStages.includes(stageNum)
        ? filters.selectedStages.filter((s) => s !== stageNum)
        : [...filters.selectedStages, stageNum];
      onFiltersChange({ ...filters, selectedStages: newSelection });
    },
    [filters, onFiltersChange],
  );

  const handleClearStages = useCallback(() => {
    onFiltersChange({ ...filters, selectedStages: [] });
  }, [filters, onFiltersChange]);

  const handleTimeRangeChange = useCallback(
    (range: TimeRangePreset) => {
      onFiltersChange({
        ...filters,
        timeRange: range,
        customDateRange:
          range !== "custom"
            ? { start: null, end: null }
            : filters.customDateRange,
      });
    },
    [filters, onFiltersChange],
  );

  const handleCustomDateChange = useCallback(
    (start: string | null, end: string | null) => {
      onFiltersChange({ ...filters, customDateRange: { start, end } });
    },
    [filters, onFiltersChange],
  );

  const handleRemovePillar = useCallback(
    (pillarCode: string) => {
      onFiltersChange({
        ...filters,
        selectedPillars: filters.selectedPillars.filter(
          (p) => p !== pillarCode,
        ),
      });
    },
    [filters, onFiltersChange],
  );

  const handleRemoveStage = useCallback(
    (stageNum: number) => {
      onFiltersChange({
        ...filters,
        selectedStages: filters.selectedStages.filter((s) => s !== stageNum),
      });
    },
    [filters, onFiltersChange],
  );

  const handleClearAll = useCallback(() => {
    onFiltersChange({
      ...DEFAULT_ANALYTICS_FILTERS,
      timeRange: filters.timeRange,
      customDateRange: filters.customDateRange,
    });
  }, [filters, onFiltersChange]);

  return (
    <div className={cn("", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          compact ? "gap-2" : "gap-3",
        )}
      >
        <PillarFilterDropdown
          selectedPillars={filters.selectedPillars}
          onTogglePillar={handleTogglePillar}
          onClearAll={handleClearPillars}
          disabled={disabled}
        />

        <StageFilterDropdown
          selectedStages={filters.selectedStages}
          onToggleStage={handleToggleStage}
          onClearAll={handleClearStages}
          disabled={disabled}
        />

        <div className="flex-1" />

        <TimeRangeFilter
          timeRange={filters.timeRange}
          customDateRange={filters.customDateRange}
          onTimeRangeChange={handleTimeRangeChange}
          onCustomDateChange={handleCustomDateChange}
          disabled={disabled}
        />
      </div>

      {!compact && (
        <ActiveFilters
          filters={filters}
          onRemovePillar={handleRemovePillar}
          onRemoveStage={handleRemoveStage}
          onClearAll={handleClearAll}
        />
      )}
    </div>
  );
};

export default AnalyticsFilters;
