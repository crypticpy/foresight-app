/**
 * Time-range dropdown: lets the user pick a preset window (7d, 30d,
 * 90d, MTD, YTD, all, …) or supply a custom start/end date pair.
 * Shows the selected range in the trigger button, abbreviated for
 * custom ranges.
 *
 * @module components/analytics/AnalyticsFilters/TimeRangeFilter
 */

import React, { useMemo, useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "../../../lib/utils";
import { Dropdown } from "./Dropdown";
import { TIME_RANGE_OPTIONS, type TimeRangePreset } from "./types";

export interface TimeRangeFilterProps {
  timeRange: TimeRangePreset;
  customDateRange: { start: string | null; end: string | null };
  onTimeRangeChange: (range: TimeRangePreset) => void;
  onCustomDateChange: (start: string | null, end: string | null) => void;
  disabled?: boolean;
}

export const TimeRangeFilter: React.FC<TimeRangeFilterProps> = ({
  timeRange,
  customDateRange,
  onTimeRangeChange,
  onCustomDateChange,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomInputs, setShowCustomInputs] = useState(
    timeRange === "custom",
  );

  const currentOption = TIME_RANGE_OPTIONS.find(
    (opt) => opt.value === timeRange,
  );

  const handleTimeRangeSelect = (value: TimeRangePreset) => {
    onTimeRangeChange(value);
    if (value === "custom") {
      setShowCustomInputs(true);
    } else {
      setShowCustomInputs(false);
      setIsOpen(false);
    }
  };

  const displayLabel = useMemo(() => {
    if (
      timeRange === "custom" &&
      customDateRange.start &&
      customDateRange.end
    ) {
      try {
        const startStr = format(parseISO(customDateRange.start), "MMM d");
        const endStr = format(parseISO(customDateRange.end), "MMM d, yyyy");
        return `${startStr} - ${endStr}`;
      } catch {
        return "Custom range";
      }
    }
    return currentOption?.label || "Select range";
  }, [timeRange, customDateRange, currentOption]);

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      align="right"
      trigger={
        <button
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
            "text-sm font-medium",
            "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300",
            "hover:bg-gray-50 dark:hover:bg-gray-700",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <Calendar className="h-4 w-4" />
          <span className="max-w-[150px] truncate">{displayLabel}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>
      }
    >
      <div className="px-1">
        {TIME_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={(e) => {
              e.stopPropagation();
              handleTimeRangeSelect(option.value);
            }}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
              "hover:bg-gray-50 dark:hover:bg-gray-700/50",
              timeRange === option.value && "bg-brand-blue/10 text-brand-blue",
            )}
          >
            <span>{option.label}</span>
            {timeRange === option.value && <Check className="h-4 w-4" />}
          </button>
        ))}
      </div>

      {showCustomInputs && (
        <div className="px-3 pt-3 mt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Start date
              </label>
              <input
                type="date"
                value={customDateRange.start || ""}
                onChange={(e) =>
                  onCustomDateChange(
                    e.target.value || null,
                    customDateRange.end,
                  )
                }
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "w-full px-2.5 py-1.5 rounded-md border text-sm",
                  "border-gray-300 dark:border-gray-600",
                  "bg-white dark:bg-gray-700",
                  "text-gray-900 dark:text-white",
                  "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent",
                )}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                End date
              </label>
              <input
                type="date"
                value={customDateRange.end || ""}
                onChange={(e) =>
                  onCustomDateChange(
                    customDateRange.start,
                    e.target.value || null,
                  )
                }
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "w-full px-2.5 py-1.5 rounded-md border text-sm",
                  "border-gray-300 dark:border-gray-600",
                  "bg-white dark:bg-gray-700",
                  "text-gray-900 dark:text-white",
                  "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent",
                )}
              />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="w-full py-1.5 mt-1 rounded-md bg-brand-blue text-white text-sm font-medium hover:bg-brand-blue/90 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </Dropdown>
  );
};
