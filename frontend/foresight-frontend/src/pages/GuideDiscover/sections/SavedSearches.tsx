/**
 * Accordion section 5/9 — how to save searches, manage them from the
 * sidebar, and use search history.
 *
 * @module pages/GuideDiscover/sections/SavedSearches
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Bookmark, History } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function SavedSearches() {
  return (
    <Accordion.Item value="saved" id="saved">
      <AccordionTrigger icon={<Bookmark className="h-5 w-5" />}>
        Saved Searches
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          When you find a useful combination of search terms and filters, save
          it for instant recall. Saved searches preserve your full
          configuration: search text, AI search toggle, all active filters,
          score thresholds, and sort order.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          How to Save a Search
        </h4>
        <ol className="list-decimal list-inside space-y-1.5 mb-4 text-sm">
          <li>Configure your desired search and filter combination</li>
          <li>
            Click the{" "}
            <Bookmark className="inline-block h-3.5 w-3.5 text-gray-500" />{" "}
            bookmark icon in the search bar area
          </li>
          <li>Give your saved search a descriptive name</li>
          <li>
            Click "Save" -- your configuration is stored and accessible from the
            Saved Searches sidebar
          </li>
        </ol>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Managing Saved Searches
        </h4>
        <p className="mb-3">
          Open the Saved Searches sidebar to see all your saved configurations.
          From there you can:
        </p>
        <ul className="list-disc list-inside space-y-1 mb-4 text-sm">
          <li>
            <span className="font-medium">Load</span> &mdash; apply a saved
            search to restore its full configuration
          </li>
          <li>
            <span className="font-medium">Edit</span> &mdash; rename or update
            the saved configuration
          </li>
          <li>
            <span className="font-medium">Delete</span> &mdash; remove saved
            searches you no longer need
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Search History
        </h4>
        <p className="mb-3">
          Foresight also keeps a history of your recent searches. Open the
          Search History panel (
          <History className="inline-block h-3.5 w-3.5 text-gray-500" />) to
          browse, restore, or clear past search sessions. This is useful for
          retracing your research path or revisiting a query you ran earlier in
          the day.
        </p>

        <ProTip title="When to Use Saved Searches">
          Create saved searches for recurring analysis tasks. For example, save
          a "Weekly Environmental Scan" with pillar set to ES, quality to High,
          and date range to the last 7 days. Load it each Monday for a
          consistent review workflow.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
