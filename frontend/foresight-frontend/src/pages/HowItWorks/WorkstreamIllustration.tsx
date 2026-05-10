/**
 * Static four-lane kanban mock used to explain that workstreams are how
 * analysts own a topic.
 *
 * @module pages/HowItWorks/WorkstreamIllustration
 */

import { cn } from "../../lib/utils";

export function WorkstreamIllustration() {
  const lanes = [
    { title: "Inbox", count: 8, color: "bg-gray-300" },
    { title: "Investigating", count: 3, color: "bg-brand-blue" },
    { title: "Briefing", count: 2, color: "bg-amber-500" },
    { title: "Done", count: 5, color: "bg-brand-green" },
  ];
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {lanes.map((l) => (
          <div
            key={l.title}
            className="rounded-xl bg-gray-50 dark:bg-dark-surface-deep p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                {l.title}
              </div>
              <span className={cn("h-2 w-2 rounded-full", l.color)} />
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: Math.min(l.count, 3) }).map((_, i) => (
                <div
                  key={i}
                  className="h-6 rounded-md bg-white dark:bg-dark-surface border border-gray-200 dark:border-gray-700"
                />
              ))}
              {l.count > 3 && (
                <div className="text-[10px] text-gray-500 text-center pt-0.5">
                  +{l.count - 3} more
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-5 leading-relaxed">
        Workstreams are how analysts <em>own</em> a topic. Drag signals through
        investigation lanes, attach research, generate briefs — and next time
        the discovery pipeline finds something relevant, it lands right in the
        workstream's queue.
      </p>
    </div>
  );
}
