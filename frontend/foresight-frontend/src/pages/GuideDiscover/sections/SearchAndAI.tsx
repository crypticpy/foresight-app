/**
 * Accordion section 2/9 — standard text search vs AI semantic search
 * side-by-side comparison and explanation.
 *
 * @module pages/GuideDiscover/sections/SearchAndAI
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Brain, CheckCircle, Search } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";
import { InfoBox } from "../InfoBox";

export function SearchAndAI() {
  return (
    <Accordion.Item value="search" id="search">
      <AccordionTrigger icon={<Search className="h-5 w-5" />}>
        Search and AI Search
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Discover offers two search modes that complement each other. The
          standard text search is fast and exact; the AI-powered semantic search
          understands meaning and concepts.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          {/* Standard Search */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-5">
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Standard Search
              </h4>
            </div>
            <ul className="text-sm space-y-2 text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-brand-green flex-shrink-0 mt-0.5" />
                <span>Matches exact keywords in titles and summaries</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-brand-green flex-shrink-0 mt-0.5" />
                <span>Fast, with debounced input for smooth typing</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-brand-green flex-shrink-0 mt-0.5" />
                <span>Best for known terms, names, or specific topics</span>
              </li>
            </ul>
          </div>

          {/* AI Search */}
          <div className="rounded-lg border border-brand-blue/30 bg-brand-light-blue/20 dark:bg-brand-blue/10 dark:border-brand-blue/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-5 w-5 text-brand-blue dark:text-brand-light-blue" />
              <h4 className="font-semibold text-gray-900 dark:text-white">
                AI Search (Semantic)
              </h4>
            </div>
            <ul className="text-sm space-y-2 text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-brand-blue flex-shrink-0 mt-0.5" />
                <span>
                  Finds conceptually related signals using vector embeddings
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-brand-blue flex-shrink-0 mt-0.5" />
                <span>
                  Understands meaning -- "urban heat" finds "cooling
                  infrastructure"
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-brand-blue flex-shrink-0 mt-0.5" />
                <span>
                  Best for exploratory queries and discovering connections
                </span>
              </li>
            </ul>
          </div>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          How AI Search Works
        </h4>
        <p className="mb-3">
          When you toggle on AI Search, your query is converted into a
          high-dimensional vector embedding using the same model that encodes
          all signal content. The system then performs a nearest-neighbor search
          in vector space, returning signals that are semantically similar to
          your query -- even if they use entirely different vocabulary.
        </p>

        <InfoBox>
          <span className="font-medium">When to use which:</span> Start with
          standard search when you know exactly what you are looking for. Switch
          to AI Search when exploring a broad topic, looking for cross-cutting
          themes, or when standard search returns too few results.
        </InfoBox>

        <ProTip title="Search Tips">
          For AI Search, phrase your query as a concept or question rather than
          isolated keywords. "How are cities adapting public transit to
          autonomous vehicles" will yield richer results than just "autonomous
          vehicles transit."
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
