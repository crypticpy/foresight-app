/**
 * Stack of source-category toggle buttons (News / Academic / Government
 * / Tech Blogs / RSS). Each row shows the category icon, label,
 * subtitle, and an iOS-style on/off pill.
 *
 * @module components/CreateSignal/SourcePreferencesStep/CategoryToggleList
 */

import { cn } from "../../../lib/utils";

import { SOURCE_CATEGORIES } from "./constants";

export interface CategoryToggleListProps {
  enabled: string[];
  onToggle: (categoryId: string) => void;
}

export function CategoryToggleList({
  enabled,
  onToggle,
}: CategoryToggleListProps) {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Source Categories
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Select which source categories to search for this signal.
      </p>
      <div className="space-y-2">
        {SOURCE_CATEGORIES.map((category) => {
          const Icon = category.icon;
          const isEnabled = enabled.includes(category.id);
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onToggle(category.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left",
                "transition-colors duration-200",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-inset",
                isEnabled
                  ? "bg-brand-blue/10 border-brand-blue dark:bg-brand-blue/20 dark:border-brand-blue/60"
                  : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500",
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
                  isEnabled
                    ? "bg-brand-blue/20 text-brand-blue dark:bg-brand-blue/30"
                    : "bg-gray-100 dark:bg-dark-surface-elevated text-gray-500 dark:text-gray-400",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "text-sm font-medium",
                    isEnabled
                      ? "text-brand-blue dark:text-blue-300"
                      : "text-gray-900 dark:text-gray-100",
                  )}
                >
                  {category.label}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {category.subtitle}
                </div>
              </div>
              <div
                className={cn(
                  "w-10 h-6 rounded-full shrink-0 relative transition-colors duration-200",
                  isEnabled ? "bg-brand-blue" : "bg-gray-300 dark:bg-gray-600",
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                    isEnabled ? "translate-x-[18px]" : "translate-x-0.5",
                  )}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
