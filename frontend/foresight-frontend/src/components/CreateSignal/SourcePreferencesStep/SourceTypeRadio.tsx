/**
 * Single-select radio group for "preferred content type" (news / blogs /
 * academic / federal / pdf). Drives downstream source-fetcher weighting.
 *
 * @module components/CreateSignal/SourcePreferencesStep/SourceTypeRadio
 */

import { cn } from "../../../lib/utils";

import { SOURCE_TYPE_OPTIONS } from "./constants";

export interface SourceTypeRadioProps {
  value: string;
  onChange: (value: string) => void;
}

export function SourceTypeRadio({ value, onChange }: SourceTypeRadioProps) {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Source Type Preference
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Choose which type of content to prioritize in results.
      </p>
      <div
        className="space-y-2"
        role="radiogroup"
        aria-label="Source type preference"
      >
        {SOURCE_TYPE_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-md border cursor-pointer",
                "transition-colors duration-200",
                isSelected
                  ? "bg-brand-blue/10 border-brand-blue dark:bg-brand-blue/20 dark:border-brand-blue/60"
                  : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500",
              )}
            >
              <input
                type="radio"
                name="preferred_type"
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
                className={cn(
                  "h-4 w-4 border-gray-300 dark:border-gray-600",
                  "text-brand-blue focus:ring-brand-blue",
                )}
              />
              <span
                className={cn(
                  "text-sm",
                  isSelected
                    ? "text-brand-blue dark:text-blue-300 font-medium"
                    : "text-gray-700 dark:text-gray-300",
                )}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
