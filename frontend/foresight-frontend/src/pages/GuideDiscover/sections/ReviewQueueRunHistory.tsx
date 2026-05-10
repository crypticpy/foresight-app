/**
 * Accordion section 8/9 — review queue actions (approve/dismiss/review) and
 * pipeline run-history log.
 *
 * @module pages/GuideDiscover/sections/ReviewQueueRunHistory
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Link } from "react-router-dom";
import { AlertTriangle, Eye, ThumbsDown, ThumbsUp } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function ReviewQueueRunHistory() {
  return (
    <Accordion.Item value="review" id="review">
      <AccordionTrigger icon={<AlertTriangle className="h-5 w-5" />}>
        Review Queue and Run History
      </AccordionTrigger>
      <AccordionContent>
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Review Queue
        </h4>
        <p className="mb-3">
          Not all discovered signals are published automatically. Some are
          placed in the{" "}
          <Link
            to="/discover/queue"
            className="font-medium text-brand-blue dark:text-brand-light-blue hover:underline"
          >
            Review Queue
          </Link>{" "}
          for human review -- typically signals with lower confidence scores,
          ambiguous classification, or content from unfamiliar sources.
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 text-center">
            <ThumbsUp className="h-6 w-6 text-brand-green mx-auto mb-2" />
            <p className="font-semibold text-sm text-gray-900 dark:text-white">
              Approve
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Publish signal to the Discover library
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 text-center">
            <ThumbsDown className="h-6 w-6 text-red-500 mx-auto mb-2" />
            <p className="font-semibold text-sm text-gray-900 dark:text-white">
              Dismiss
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Remove as irrelevant or low quality
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 text-center">
            <Eye className="h-6 w-6 text-brand-blue mx-auto mb-2" />
            <p className="font-semibold text-sm text-gray-900 dark:text-white">
              Review
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Inspect full detail before deciding
            </p>
          </div>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Run History
        </h4>
        <p className="mb-3">
          The{" "}
          <Link
            to="/discover/history"
            className="font-medium text-brand-blue dark:text-brand-light-blue hover:underline"
          >
            Run History
          </Link>{" "}
          page shows a log of every discovery pipeline execution. Each entry
          includes:
        </p>
        <ul className="list-disc list-inside space-y-1 mb-4 text-sm">
          <li>Timestamp and duration of the discovery run</li>
          <li>Number of sources scanned per category</li>
          <li>Number of new signals created vs. deduplicated</li>
          <li>Number of signals queued for review</li>
          <li>Any errors or warnings encountered</li>
        </ul>

        <ProTip>
          Check Run History when coverage feels sparse for a topic. If recent
          runs show high deduplication rates, the topic may already be
          well-covered. If they show errors for certain source categories, it
          may indicate a temporary data issue.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
