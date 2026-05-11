/**
 * Single radio-style card for the PPTX / PDF format choice. Visual chrome
 * (selected ring, AI badge) lives here so the parent stays focused on
 * state.
 *
 * @module components/BulkExportModal/FormatOption
 */

import React from "react";
import { Sparkles } from "lucide-react";

import { cn } from "../../lib/utils";

export interface FormatOptionProps {
  format: "pptx" | "pdf";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isSelected: boolean;
  onSelect: () => void;
  isPowered?: boolean;
}

export function FormatOption({
  title,
  description,
  icon: Icon,
  isSelected,
  onSelect,
  isPowered = false,
}: FormatOptionProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start p-4 rounded-lg border-2 transition-all duration-200 text-left",
        isSelected
          ? "border-[#44499C] bg-[#44499C]/5"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={cn(
            "h-5 w-5",
            isSelected ? "text-[#44499C]" : "text-gray-400",
          )}
        />
        <span
          className={cn(
            "font-medium",
            isSelected
              ? "text-brand-blue dark:text-[#7c7fd4]"
              : "text-gray-700 dark:text-gray-300",
          )}
        >
          {title}
        </span>
        {isPowered && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            <Sparkles className="h-2.5 w-2.5" />
            AI
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </button>
  );
}
