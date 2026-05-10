/**
 * Methodology accordion section 1/6 — discovery pipeline overview.
 *
 * @module pages/Methodology/sections/Pipeline
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Rss } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function Pipeline() {
  return (
    <Accordion.Item value="pipeline" id="pipeline">
      <AccordionTrigger icon={<Rss className="h-5 w-5" />}>
        How We Discover Information
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Foresight continuously monitors hundreds of sources across news,
          academic research, government publications, and technology media. Our
          AI-powered pipeline fetches, validates, and classifies content
          relevant to Austin's strategic priorities.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Source Types
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>RSS feeds from curated publications and government outlets</li>
          <li>NewsAPI for real-time global news coverage</li>
          <li>
            Tavily web search for emerging topics not yet in traditional feeds
          </li>
          <li>Academic databases for peer-reviewed research</li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Processing Safeguards
        </h4>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-medium">Update frequency</span> &mdash;
            configurable per workstream to balance freshness and volume
          </li>
          <li>
            <span className="font-medium">Content validation</span> &mdash;
            minimum content length and freshness filtering by category
          </li>
          <li>
            <span className="font-medium">Deduplication</span> &mdash; semantic
            similarity matching (via vector embeddings) prevents duplicate
            coverage across sources
          </li>
        </ul>
      </AccordionContent>
    </Accordion.Item>
  );
}
