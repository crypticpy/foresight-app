/**
 * Accordion section 3/9 — multi-dimensional filtering: pillar/horizon/maturity
 * type explorer, score thresholds, quality tier, quick chips, date range.
 *
 * @module pages/GuideDiscover/sections/FilteringYourView
 */

import { useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import {
  BarChart3,
  ChevronDown,
  Clock,
  Eye,
  Layers,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { cn } from "@/lib/utils";
import { horizons, pillars } from "@/data/taxonomy";
import { AccordionTrigger, AccordionContent } from "../_accordion";

const FILTER_TYPES = [
  {
    name: "Strategic Pillars",
    icon: <Layers className="h-5 w-5" />,
    // Derived from the canonical taxonomy so codes/labels always match the
    // six pillars the product classifies signals under.
    items: pillars.map((p) => ({
      code: p.code,
      label: p.name,
      desc: p.description,
    })),
  },
  {
    name: "Time Horizons",
    icon: <Clock className="h-5 w-5" />,
    // Derived from the canonical taxonomy so the names and timeframes always
    // match the horizon badges and tooltips shown on every signal card.
    items: horizons.map((h) => ({
      code: h.code,
      label: `${h.name} (${h.timeframe})`,
      desc: h.description,
    })),
  },
  {
    name: "Maturity Stages",
    icon: <BarChart3 className="h-5 w-5" />,
    items: [
      { code: "1", label: "Concept", desc: "Early idea or proposal stage" },
      {
        code: "2",
        label: "Exploring",
        desc: "Active research and investigation",
      },
      {
        code: "3",
        label: "Pilot",
        desc: "Small-scale trial or proof of concept",
      },
      {
        code: "4",
        label: "PoC",
        desc: "Proof of concept with measured results",
      },
      { code: "5", label: "Implementing", desc: "Active rollout in progress" },
      {
        code: "6",
        label: "Scaling",
        desc: "Expanding beyond initial deployment",
      },
      { code: "7", label: "Mature", desc: "Established and widely adopted" },
      { code: "8", label: "Declining", desc: "Being phased out or superseded" },
    ],
  },
];

const QUALITY_TIERS = [
  {
    tier: "High",
    color: "bg-brand-green/10 text-brand-green border-brand-green/30",
    desc: "Well-sourced, multiple corroborating references",
  },
  {
    tier: "Moderate",
    color:
      "bg-amber-100/60 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300/40",
    desc: "Reasonable sourcing with some gaps",
  },
  {
    tier: "Needs Verification",
    color:
      "bg-red-100/60 text-red-600 dark:bg-red-900/20 dark:text-red-400 border-red-300/40",
    desc: "Limited sources, requires analyst review",
  },
];

const QUICK_CHIPS = [
  { label: "All Signals", icon: <Eye className="h-3.5 w-3.5" /> },
  { label: "New This Week", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { label: "Updated This Week", icon: <Clock className="h-3.5 w-3.5" /> },
];

export function FilteringYourView() {
  const [expandedFilter, setExpandedFilter] = useState<string | null>(null);

  return (
    <Accordion.Item value="filtering" id="filtering">
      <AccordionTrigger icon={<SlidersHorizontal className="h-5 w-5" />}>
        Filtering Your View
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Discover provides multi-dimensional filtering to help you focus on
          exactly the signals that matter for your work. Filters can be combined
          freely and are preserved in your saved searches.
        </p>

        <div className="space-y-3 mb-5">
          {FILTER_TYPES.map((ft) => (
            <div
              key={ft.name}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedFilter(expandedFilter === ft.name ? null : ft.name)
                }
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-surface-elevated transition-colors"
              >
                <span className="text-brand-blue dark:text-brand-light-blue">
                  {ft.icon}
                </span>
                <span className="flex-1 font-semibold text-sm text-gray-900 dark:text-white">
                  {ft.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {ft.items.length} options
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-gray-400 transition-transform duration-200",
                    expandedFilter === ft.name && "rotate-180",
                  )}
                />
              </button>
              <div
                className={cn(
                  "transition-all duration-300 overflow-hidden",
                  expandedFilter === ft.name
                    ? "max-h-[600px] opacity-100"
                    : "max-h-0 opacity-0",
                )}
              >
                <div className="px-4 pb-4 pt-1">
                  <div className="flex flex-wrap gap-2">
                    {ft.items.map((item) => (
                      <div
                        key={item.code}
                        className="rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-dark-surface-elevated px-3 py-2 text-xs"
                      >
                        <span className="font-bold text-brand-blue dark:text-brand-light-blue">
                          {item.code}
                        </span>
                        <span className="mx-1.5 text-gray-400">|</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {item.label}
                        </span>
                        {item.desc && (
                          <p className="mt-1 text-gray-500 dark:text-gray-400">
                            {item.desc}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Score Threshold Sliders
        </h4>
        <p className="mb-3">
          Use the Impact, Relevance, and Novelty sliders to set minimum score
          thresholds. Only signals meeting or exceeding all thresholds will
          appear. This is useful for focusing on high-impact or highly novel
          content.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Quality Tier Filter
        </h4>
        <div className="flex flex-wrap gap-2 mb-4">
          {QUALITY_TIERS.map((q) => (
            <div
              key={q.tier}
              className={cn("rounded-md border px-3 py-2 text-xs", q.color)}
            >
              <span className="font-semibold">{q.tier}</span>
              <span className="ml-1.5 opacity-75">&mdash; {q.desc}</span>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Quick Filter Chips
        </h4>
        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_CHIPS.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-surface px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              {chip.icon}
              {chip.label}
            </span>
          ))}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Quick filter chips appear above the signal grid and let you rapidly
          toggle between common views. "New This Week" and "Updated This Week"
          surface fresh intelligence without requiring manual date range
          filtering.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Date Range
        </h4>
        <p className="mb-1">
          Constrain results to a specific creation or update window using the
          date range picker. This is particularly useful for reviewing what
          appeared during a specific period (e.g., a council session or planning
          cycle).
        </p>

        <ProTip defaultOpen>
          Combine filters strategically: set pillar to "MC" (Mobility), horizon
          to "H1" (Mainstream), and quality to "High" to see only the most
          credible near-term transportation signals. Save this combination for
          quick access later.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
