/**
 * The scope dropdown button at the top of the AskForesight page. Lists
 * "All Signals" (global) plus every workstream the user owns. Closes
 * itself on outside-click via a fixed backdrop.
 *
 * @module pages/AskForesight/ScopeSelector
 */

import { FolderOpen, Globe } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ScopeOption } from "./utils";

export interface ScopeSelectorProps {
  selectedScope: ScopeOption;
  scopeOptions: ScopeOption[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (option: ScopeOption) => void;
}

export function ScopeSelector({
  selectedScope,
  scopeOptions,
  isOpen,
  onToggle,
  onClose,
  onSelect,
}: ScopeSelectorProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg",
          "border border-gray-200 dark:border-gray-600",
          "bg-white dark:bg-dark-surface",
          "text-gray-700 dark:text-gray-300",
          "hover:bg-gray-50 dark:hover:bg-dark-surface-hover",
          "focus:outline-none focus:ring-2 focus:ring-brand-blue",
          "transition-colors duration-200",
        )}
      >
        {selectedScope.scope === "global" ? (
          <Globe className="h-4 w-4 text-brand-blue" aria-hidden="true" />
        ) : (
          <FolderOpen className="h-4 w-4 text-brand-green" aria-hidden="true" />
        )}
        <span className="max-w-[180px] truncate">{selectedScope.label}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div
            className={cn(
              "absolute left-0 top-full mt-1 z-20",
              "w-64 max-h-72 overflow-y-auto",
              "bg-white dark:bg-dark-surface",
              "border border-gray-200 dark:border-gray-600",
              "rounded-lg shadow-lg",
              "py-1",
              "animate-in fade-in-0 zoom-in-95 duration-200",
            )}
          >
            {scopeOptions.map((option) => {
              const isSelected =
                selectedScope.scope === option.scope &&
                selectedScope.scopeId === option.scopeId;
              return (
                <button
                  key={`${option.scope}-${option.scopeId || "global"}`}
                  type="button"
                  onClick={() => onSelect(option)}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2 text-sm text-left",
                    "transition-colors duration-150",
                    isSelected
                      ? "bg-brand-blue/10 text-brand-blue"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-surface-hover",
                  )}
                >
                  {option.scope === "global" ? (
                    <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <FolderOpen
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
