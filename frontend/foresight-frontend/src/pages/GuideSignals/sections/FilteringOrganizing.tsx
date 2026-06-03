/**
 * Accordion section 5/9 — filters, sorting, grouping, view modes, and
 * pinning on the My Signals page.
 *
 * @module pages/GuideSignals/sections/FilteringOrganizing
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Filter, Grid, List, Star } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { horizons, pillars } from "@/data/taxonomy";
import { AccordionTrigger, AccordionContent } from "../_accordion";

const FILTER_ROWS = [
  {
    filter: "Search",
    options: "Free-text search across signal names and summaries",
  },
  {
    filter: "Pillar",
    options: `${pillars.map((p) => p.code).join(", ")}, or All Pillars`,
  },
  {
    filter: "Horizon",
    // Derived from the canonical taxonomy so the timeframes match the badges.
    options: `${horizons
      .map((h) => `${h.code} (${h.timeframe})`)
      .join(", ")}, or All Horizons`,
  },
  {
    filter: "Source",
    options: "All Sources, Followed, Created by Me, In Workstreams",
  },
  {
    filter: "Quality Score",
    options: "Slider from 0 to 100 to set a minimum threshold",
  },
];

const GROUPING_OPTIONS = [
  {
    label: "By Pillar",
    desc: "See signals organized under their strategic pillars",
  },
  {
    label: "By Horizon",
    desc: "Separate short, medium, and long-range signals",
  },
  {
    label: "By Workstream",
    desc: "Signals grouped by research workstream",
  },
];

export function FilteringOrganizing() {
  return (
    <Accordion.Item value="filtering" id="filtering">
      <AccordionTrigger icon={<Filter className="h-5 w-5" />}>
        Filtering and Organizing
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          As your signal collection grows, the filtering and organization tools
          help you focus on what matters most. All filters work together and can
          be combined freely.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Filter Options
        </h4>
        <div className="overflow-x-auto mb-5">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                <th className="text-left py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                  Filter
                </th>
                <th className="text-left py-2 font-semibold text-gray-900 dark:text-gray-100">
                  Options
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {FILTER_ROWS.map((row) => (
                <tr key={row.filter}>
                  <td className="py-2 pr-4 font-medium text-gray-800 dark:text-gray-200">
                    {row.filter}
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {row.options}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Sorting
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-5 text-sm">
          <li>
            <span className="font-medium">Last Updated</span> &mdash; Signals
            with the most recent activity appear first
          </li>
          <li>
            <span className="font-medium">Date Followed</span> &mdash; Most
            recently followed signals first
          </li>
          <li>
            <span className="font-medium">Quality Score</span> &mdash; Highest
            SQI scores first
          </li>
          <li>
            <span className="font-medium">Name (A-Z)</span> &mdash; Alphabetical
            ordering
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Grouping
        </h4>
        <p className="text-sm mb-3">
          Group your signals by one dimension to see clusters and patterns:
        </p>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {GROUPING_OPTIONS.map((g) => (
            <div
              key={g.label}
              className="px-3 py-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-surface"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {g.label}
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {g.desc}
              </p>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          View Modes and Pinning
        </h4>
        <div className="space-y-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <Grid className="h-4 w-4 text-brand-blue" />
              <List className="h-4 w-4 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-800 dark:text-gray-200">
                Grid and List views
              </span>{" "}
              &mdash; Switch between a card grid layout and a compact list
              layout depending on your preference. Grid view shows full
              summaries and badges; list view is denser for scanning many
              signals quickly.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Star className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-800 dark:text-gray-200">
                Pin/Star signals
              </span>{" "}
              &mdash; Click the star icon on any signal card to pin it for
              priority tracking. Pinned signals always appear at the top of
              their group, regardless of sort order.
            </p>
          </div>
        </div>

        <ProTip defaultOpen>
          Combine grouping by pillar with sorting by quality score to quickly
          identify the strongest signals in each strategic area. This is
          especially useful for preparing pillar-specific briefings.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
