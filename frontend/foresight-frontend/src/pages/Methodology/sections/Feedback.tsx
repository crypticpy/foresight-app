/**
 * Methodology accordion section 6/6 — how user ratings flow back into the
 * domain reputation scores that drive future triage.
 *
 * @module pages/Methodology/sections/Feedback
 */

import * as Accordion from "@radix-ui/react-accordion";
import { MessageSquareHeart } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function Feedback() {
  return (
    <Accordion.Item value="feedback" id="feedback">
      <AccordionTrigger icon={<MessageSquareHeart className="h-5 w-5" />}>
        How Your Feedback Improves the System
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          When you rate sources, your ratings are aggregated into domain
          reputation scores that directly influence how the discovery pipeline
          prioritizes and filters content.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Feedback Mechanisms
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            <span className="font-medium">Quality rating</span> &mdash;
            per-source rating on a 1&ndash;5 star scale
          </li>
          <li>
            <span className="font-medium">Municipal relevance</span> &mdash;
            High / Medium / Low / Not Relevant assessment
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          How Feedback Flows Back
        </h4>
        <ol className="list-decimal list-inside space-y-1">
          <li>User rates a source on a card</li>
          <li>Ratings are aggregated nightly into domain composite scores</li>
          <li>
            Higher-rated domains receive a boost during future triage, surfacing
            their content more prominently
          </li>
          <li>
            Lower-rated domains are de-prioritized, reducing noise over time
          </li>
        </ol>
      </AccordionContent>
    </Accordion.Item>
  );
}
