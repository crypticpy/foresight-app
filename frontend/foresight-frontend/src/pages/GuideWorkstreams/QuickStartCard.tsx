/**
 * Click-to-expand step card used in the four-up Quick Start row at the
 * top of the workstreams guide.
 *
 * @module pages/GuideWorkstreams/QuickStartCard
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import type { QuickStartStep } from "./types";

export function QuickStartCard({ data }: { data: QuickStartStep }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className={cn(
        "relative flex flex-col items-center text-center p-5 rounded-xl border transition-all duration-200 cursor-pointer print:break-inside-avoid",
        "bg-white dark:bg-dark-surface",
        expanded
          ? "border-brand-blue shadow-lg shadow-brand-blue/10 dark:shadow-brand-blue/20 ring-1 ring-brand-blue/20"
          : "border-gray-200 dark:border-gray-700 hover:border-brand-blue/40 hover:shadow-md",
      )}
    >
      <div
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors",
          expanded
            ? "bg-brand-blue text-white"
            : "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-light-blue",
        )}
      >
        {data.icon}
      </div>
      <span className="text-xs font-bold text-brand-blue dark:text-brand-light-blue uppercase tracking-wider mb-1">
        Step {data.step}
      </span>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
        {data.title}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {data.description}
      </p>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 w-full">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed text-left">
            {data.details}
          </p>
        </div>
      )}
      <ChevronDown
        className={cn(
          "absolute top-3 right-3 h-3.5 w-3.5 text-gray-400 transition-transform duration-200",
          expanded && "rotate-180",
        )}
      />
    </button>
  );
}
