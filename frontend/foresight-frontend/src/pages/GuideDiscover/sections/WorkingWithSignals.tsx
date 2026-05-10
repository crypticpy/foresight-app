/**
 * Accordion section 4/9 — grid/list views, following signals, comparison
 * mode, and how to navigate into signal detail.
 *
 * @module pages/GuideDiscover/sections/WorkingWithSignals
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Link } from "react-router-dom";
import { GitCompare, Grid3X3, List, Star } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";
import { InfoBox } from "../InfoBox";

export function WorkingWithSignals() {
  return (
    <Accordion.Item value="working" id="working">
      <AccordionTrigger icon={<Grid3X3 className="h-5 w-5" />}>
        Working with Signals
      </AccordionTrigger>
      <AccordionContent>
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Grid and List Views
        </h4>
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4">
            <div className="flex items-center gap-2 mb-2">
              <Grid3X3 className="h-5 w-5 text-brand-blue dark:text-brand-light-blue" />
              <span className="font-semibold text-sm text-gray-900 dark:text-white">
                Grid View
              </span>
              <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 italic">
                default
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Cards arranged in a responsive grid. Best for visual scanning and
              when you want to compare card badges, scores, and pillar
              indicators at a glance.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4">
            <div className="flex items-center gap-2 mb-2">
              <List className="h-5 w-5 text-brand-blue dark:text-brand-light-blue" />
              <span className="font-semibold text-sm text-gray-900 dark:text-white">
                List View
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Compact rows with key metadata visible inline. Ideal for scanning
              large result sets quickly and when working with more data-dense
              analysis workflows.
            </p>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Both views use virtualized rendering -- only the signals currently
          visible in your viewport are rendered, keeping the page fast even with
          thousands of results.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Following and Unfollowing
        </h4>
        <p className="mb-3">
          Click the <Star className="inline-block h-4 w-4 text-amber-500" />{" "}
          star icon on any card to follow that signal. Following uses optimistic
          updates -- the star fills immediately while the request processes in
          the background. To unfollow, click the star again.
        </p>
        <p className="mb-4">
          Followed signals appear on your{" "}
          <Link
            to="/signals"
            className="font-medium text-brand-blue dark:text-brand-light-blue hover:underline"
          >
            My Signals
          </Link>{" "}
          page, where you can organize, prioritize, and route them into research
          workstreams.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Card Comparison Mode
        </h4>
        <p className="mb-3">
          Need to evaluate two signals side by side? Activate comparison mode by
          clicking the compare icon (
          <GitCompare className="inline-block h-4 w-4 text-gray-500" />) on any
          card. Select a second card to open the full comparison view, which
          displays both signals with their complete metadata, scores, and
          classifications aligned for easy visual comparison.
        </p>

        <InfoBox>
          <span className="font-medium">Navigating to detail:</span> Click any
          signal's title or the "View" action to open its full detail page,
          where you can see the complete analysis, all source references,
          related signals, and the full scoring breakdown.
        </InfoBox>

        <ProTip>
          Comparison mode is especially useful for understanding why two
          seemingly similar signals were scored differently. Compare their
          source quality, recency, and pillar alignment to see what drives the
          difference.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
