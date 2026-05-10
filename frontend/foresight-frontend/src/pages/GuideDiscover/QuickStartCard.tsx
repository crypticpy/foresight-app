/**
 * Click-to-expand step card used in the four-up Quick Start row at the
 * top of the discover guide. Each card has an inactive collapsed state
 * and an active expanded state showing additional detail.
 *
 * @module pages/GuideDiscover/QuickStartCard
 */

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface QuickStartCardProps {
  step: number;
  title: string;
  description: string;
  detail: string;
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
}

export function QuickStartCard({
  step,
  title,
  description,
  detail,
  icon,
  isActive,
  onClick,
}: QuickStartCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start rounded-xl border p-5 text-left transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        isActive
          ? "border-brand-blue bg-white dark:bg-dark-surface shadow-md ring-1 ring-brand-blue/20"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface/60",
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors",
            isActive
              ? "bg-brand-blue text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400",
          )}
        >
          {step}
        </span>
        <span
          className={cn(
            "transition-colors",
            isActive
              ? "text-brand-blue dark:text-brand-light-blue"
              : "text-gray-500 dark:text-gray-400",
          )}
        >
          {icon}
        </span>
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
        {title}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      <div
        className={cn(
          "mt-3 overflow-hidden transition-all duration-300",
          isActive ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="border-t border-gray-200 dark:border-gray-600 pt-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {detail}
        </div>
      </div>
    </button>
  );
}
