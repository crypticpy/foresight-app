/**
 * Accordion section 5/10 — research tiers, how research works, and the
 * card-level research status indicators.
 *
 * @module pages/GuideWorkstreams/sections/DeepResearch
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Brain } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { cn } from "../../../lib/utils";
import { AccordionTrigger, AccordionContent } from "../_accordion";
import { ResearchComparisonTable } from "../ResearchComparisonTable";

export function DeepResearch() {
  return (
    <Accordion.Item value="research" id="research">
      <AccordionTrigger icon={<Brain className="h-5 w-5" />}>
        Deep Research
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Foresight provides three tiers of AI research, each designed for a
          different stage of the investigation workflow. All research is powered
          by gpt-researcher, which orchestrates multiple web searches and
          synthesizes findings from diverse sources.
        </p>

        <ResearchComparisonTable />

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-2">
          How AI Research Works
        </h4>
        <ol className="list-decimal list-inside space-y-2 mb-4">
          <li>
            You trigger a research action on a card (Deep Dive, Quick Update, or
            Check for Updates).
          </li>
          <li>
            The system formulates targeted search queries based on the signal's
            title, summary, and your workstream's focus areas.
          </li>
          <li>
            gpt-researcher conducts multiple parallel web searches across
            academic databases, government publications, news sources, and
            industry reports.
          </li>
          <li>
            Retrieved content is validated for relevance and quality, then
            synthesized into a structured research report.
          </li>
          <li>
            The research findings are attached to the card and become available
            for brief generation.
          </li>
        </ol>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Research Status Tracking
        </h4>
        <p className="mb-4">
          While research is in progress, a status indicator appears on the card
          in the Kanban board. Cards can be in one of four research states:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            {
              label: "Queued",
              desc: "Waiting to start",
              color: "bg-gray-100 dark:bg-gray-700",
            },
            {
              label: "Processing",
              desc: "Research in progress",
              color: "bg-blue-100 dark:bg-blue-900/30",
            },
            {
              label: "Completed",
              desc: "Results ready",
              color: "bg-green-100 dark:bg-green-900/30",
            },
            {
              label: "Failed",
              desc: "Can retry",
              color: "bg-red-100 dark:bg-red-900/30",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={cn("rounded-lg p-3 text-center text-xs", s.color)}
            >
              <div className="font-semibold text-gray-900 dark:text-white">
                {s.label}
              </div>
              <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                {s.desc}
              </div>
            </div>
          ))}
        </div>

        <ProTip defaultOpen>
          You do not need to wait on the research page. The research runs in the
          background. Navigate away and come back later -- the board will show
          updated status indicators when you return.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
