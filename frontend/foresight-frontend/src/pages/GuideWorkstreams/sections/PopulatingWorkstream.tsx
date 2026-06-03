/**
 * Accordion section 4/10 — three ways to add signals to a workstream:
 * auto-populate, scan, and manual add.
 *
 * @module pages/GuideWorkstreams/sections/PopulatingWorkstream
 */

import * as Accordion from "@radix-ui/react-accordion";
import { MousePointerClick, Sparkles, Telescope } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function PopulatingWorkstream() {
  return (
    <Accordion.Item value="populating" id="populating">
      <AccordionTrigger icon={<Sparkles className="h-5 w-5" />}>
        Populating Your Workstream
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          There are three ways to add signals to your workstream, each suited to
          different situations:
        </p>

        <div className="space-y-4 mb-6">
          {/* Auto-Populate */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                Auto-Populate
              </h4>
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                Recommended First
              </span>
            </div>
            <p className="text-sm mb-2">
              The AI scans the existing signal database and matches cards to
              your workstream's filters (pillars, keywords, stages, horizon).
              Matched signals are added directly to your Inbox.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong>When to use:</strong> When you first create a workstream,
              or when you want to check if any recently discovered signals match
              your focus area. This happens automatically when you open the
              Kanban board.
            </p>
          </div>

          {/* Workstream Scan */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Telescope className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                Workstream Scan
              </h4>
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                New Content
              </span>
            </div>
            <p className="text-sm mb-2">
              Triggers a targeted discovery scan that searches the web for fresh
              content matching your workstream's keywords and pillars. Newly
              discovered signals are created and added to your Inbox.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong>When to use:</strong> When you need the latest information
              that may not be in the database yet. Limited to 2 scans per day
              per workstream. Requires at least keywords or pillars to be
              configured.
            </p>
          </div>

          {/* Manual Add */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <MousePointerClick className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                Manual Add from Discover
              </h4>
            </div>
            <p className="text-sm mb-2">
              Browse the Discover page, find a signal of interest, and add it to
              your workstream via the card's action menu. This gives you full
              control over exactly which signals enter your research pipeline.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong>When to use:</strong> When you spot a specific signal
              during browsing that is relevant to your research, even if it does
              not match your filter criteria exactly.
            </p>
          </div>
        </div>

        <ProTip defaultOpen>
          The best approach is to combine all three methods. Start with
          Auto-Populate for breadth, run a Workstream Scan for fresh content,
          and manually add any specific signals you find during your regular
          browsing of the Discover page.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
