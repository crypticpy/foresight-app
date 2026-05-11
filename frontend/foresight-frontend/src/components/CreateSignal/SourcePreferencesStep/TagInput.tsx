/**
 * Reusable tag input — adds/removes string items with optional
 * validation and a max-items cap. Used for priority domains, RSS
 * feeds, and keywords in SourcePreferencesStep.
 *
 * @module components/CreateSignal/SourcePreferencesStep/TagInput
 */

import React, { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";

import { cn } from "../../../lib/utils";

export interface TagInputProps {
  label: string;
  items: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  placeholder: string;
  icon: React.ElementType;
  validate?: (value: string) => string | null;
  maxItems?: number;
}

export function TagInput({
  label,
  items,
  onAdd,
  onRemove,
  placeholder,
  icon: Icon,
  validate,
  maxItems = 20,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canAddMore = items.length < maxItems;

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (validate) {
      const validationError = validate(trimmed);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    if (items.includes(trimmed)) {
      setError("Already added");
      return;
    }

    if (items.length >= maxItems) {
      setError(`Maximum of ${maxItems} items allowed`);
      return;
    }

    setError(null);
    setInputValue("");
    onAdd(trimmed);
  }, [inputValue, items, maxItems, validate, onAdd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleAdd();
      } else if (e.key === "Escape") {
        setInputValue("");
        setError(null);
      }
    },
    [handleAdd],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {items.length} / {maxItems}
        </span>
      </div>

      {canAddMore && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Icon
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn(
                "w-full pl-8 pr-3 py-2 text-sm rounded-md border",
                "bg-white dark:bg-dark-surface",
                "text-gray-900 dark:text-gray-100",
                "placeholder-gray-400 dark:placeholder-gray-500",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent",
                error
                  ? "border-red-300 dark:border-red-700"
                  : "border-gray-300 dark:border-gray-600",
              )}
              aria-label={`Add ${label.toLowerCase()}`}
              aria-invalid={!!error}
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!inputValue.trim()}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md",
              "bg-brand-blue text-white hover:bg-brand-dark-blue",
              "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors duration-200",
            )}
            aria-label={`Add ${label.toLowerCase()}`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="list"
          aria-label={`Added ${label.toLowerCase()}`}
        >
          {items.map((item) => (
            <div
              key={item}
              role="listitem"
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
                "bg-gray-100 dark:bg-dark-surface-elevated",
                "text-xs text-gray-700 dark:text-gray-300",
                "border border-gray-200 dark:border-gray-600",
                "max-w-[300px]",
              )}
            >
              <Icon
                className="h-3 w-3 shrink-0 text-gray-400"
                aria-hidden="true"
              />
              <span className="truncate" title={item}>
                {item}
              </span>
              <button
                type="button"
                onClick={() => onRemove(item)}
                className={cn(
                  "shrink-0 p-0.5 rounded-full",
                  "text-gray-400 hover:text-red-500 dark:hover:text-red-400",
                  "hover:bg-gray-200 dark:hover:bg-gray-600",
                  "focus:outline-none focus:ring-1 focus:ring-red-400",
                  "transition-colors duration-200",
                )}
                aria-label={`Remove ${item}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
