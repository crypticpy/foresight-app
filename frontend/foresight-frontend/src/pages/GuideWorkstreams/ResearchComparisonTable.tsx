/**
 * Compares the three research tiers (Deep Dive / Quick Update / Check for
 * Updates) side-by-side. Renders as a table on desktop and stacked cards
 * on small screens, with row-hover highlighting on desktop.
 *
 * @module pages/GuideWorkstreams/ResearchComparisonTable
 */

import { useState } from "react";
import { Brain, RefreshCw, Zap } from "lucide-react";
import { cn } from "../../lib/utils";

export function ResearchComparisonTable() {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const methods = [
    {
      id: "deep-dive",
      name: "Deep Dive",
      icon: <Brain className="h-4 w-4" />,
      sources: "15+ sources",
      duration: "3-8 minutes",
      depth: "Comprehensive",
      bestFor:
        "Full investigation of high-priority signals. Produces detailed research across academic, government, and industry sources.",
      column: "Working",
      color: "border-blue-500",
    },
    {
      id: "quick-update",
      name: "Quick Update",
      icon: <Zap className="h-4 w-4" />,
      sources: "5 sources",
      duration: "30-90 seconds",
      depth: "Surface",
      bestFor:
        "Fast triage of a fresh signal. Provides a concise snapshot to decide if it warrants a deeper Deep Dive.",
      column: "Working",
      color: "border-yellow-500",
    },
    {
      id: "check-updates",
      name: "Check for Updates",
      icon: <RefreshCw className="h-4 w-4" />,
      sources: "3-5 sources",
      duration: "20-60 seconds",
      depth: "Focused",
      bestFor:
        "Monitoring signals you are watching. Looks for new developments since the last research run.",
      column: "Any (watched)",
      color: "border-green-500",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-300 dark:border-gray-600">
              {["Method", "Sources", "Duration", "Depth", "Best For"].map(
                (header) => (
                  <th
                    key={header}
                    className="text-left py-2.5 pr-4 font-semibold text-gray-900 dark:text-gray-100"
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {methods.map((m) => (
              <tr
                key={m.id}
                onMouseEnter={() => setHighlighted(m.id)}
                onMouseLeave={() => setHighlighted(null)}
                className={cn(
                  "transition-colors cursor-default",
                  highlighted === m.id &&
                    "bg-brand-blue/5 dark:bg-brand-blue/10",
                )}
              >
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-brand-blue dark:text-brand-light-blue">
                      {m.icon}
                    </span>
                    <span className="font-medium">{m.name}</span>
                  </div>
                </td>
                <td className="py-2.5 pr-4 tabular-nums">{m.sources}</td>
                <td className="py-2.5 pr-4 tabular-nums">{m.duration}</td>
                <td className="py-2.5 pr-4">
                  <span
                    className={cn(
                      "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
                      m.depth === "Comprehensive" &&
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                      m.depth === "Surface" &&
                        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                      m.depth === "Focused" &&
                        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                    )}
                  >
                    {m.depth}
                  </span>
                </td>
                <td className="py-2.5 text-gray-600 dark:text-gray-400 text-xs leading-relaxed max-w-xs">
                  {m.bestFor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {methods.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-lg border-l-4 bg-white dark:bg-dark-surface p-4 shadow-sm",
              m.color,
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-brand-blue dark:text-brand-light-blue">
                {m.icon}
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {m.name}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
              <div>
                <span className="text-gray-500 dark:text-gray-400 block">
                  Sources
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {m.sources}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block">
                  Duration
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {m.duration}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block">
                  Column
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {m.column}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {m.bestFor}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
