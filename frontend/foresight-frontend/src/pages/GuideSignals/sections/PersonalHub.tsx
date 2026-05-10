/**
 * Accordion section 2/7 — the three signal source types (followed / created
 * / workstream) and the stats-row summary that lives at the top of the My
 * Signals page.
 *
 * @module pages/GuideSignals/sections/PersonalHub
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Eye, Layers, PenTool, Target } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { cn } from "../../../lib/utils";
import { AccordionTrigger, AccordionContent } from "../_accordion";

const SOURCE_TYPES = [
  {
    icon: Eye,
    title: "Followed Signals",
    desc: "Signals you discovered and chose to track from the Discover page. Following a signal adds it to your hub and subscribes you to updates.",
    badge: "Followed",
    badgeClass:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  },
  {
    icon: PenTool,
    title: "Created Signals",
    desc: "Signals you created manually or via the quick-create wizard. These track topics you identified that were not yet in the system.",
    badge: "Created",
    badgeClass:
      "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  },
  {
    icon: Layers,
    title: "Workstream Signals",
    desc: "Signals that have been added to one or more of your research workstreams. These are actively being researched as part of a structured investigation.",
    badge: "Workstream",
    badgeClass:
      "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  },
];

const STATS = [
  { label: "Total Signals", desc: "Count of all signals in your hub" },
  { label: "Followed / Created", desc: "Breakdown by source type" },
  { label: "Updated This Week", desc: "Signals with fresh activity" },
  { label: "Needs Research", desc: "Low-source signals to investigate" },
];

export function PersonalHub() {
  return (
    <Accordion.Item value="personal-hub" id="personal-hub">
      <AccordionTrigger icon={<Target className="h-5 w-5" />}>
        Your Personal Hub
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          The My Signals page is your personalized intelligence dashboard. It
          brings together signals from three different sources into one unified
          view:
        </p>

        <div className="space-y-3 mb-5">
          {SOURCE_TYPES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex items-start gap-4 px-4 py-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 dark:bg-dark-surface-elevated shrink-0">
                  <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                      {item.title}
                    </h4>
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border",
                        item.badgeClass,
                      )}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Stats Row
        </h4>
        <p className="text-sm mb-3">
          At the top of the page, four stat cards give you an at-a-glance
          summary:
        </p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="px-3 py-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-surface"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {stat.label}
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {stat.desc}
              </p>
            </div>
          ))}
        </div>

        <ProTip>
          The &ldquo;Needs Research&rdquo; stat highlights signals with few
          sources. These are good candidates for adding to a workstream and
          running a deep research task.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
