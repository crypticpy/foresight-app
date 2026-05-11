/**
 * Accordion section 2/10 — fields and pro tip for creating a new
 * workstream.
 *
 * @module pages/GuideWorkstreams/sections/CreatingWorkstream
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function CreatingWorkstream() {
  return (
    <Accordion.Item value="creating" id="creating">
      <AccordionTrigger icon={<Plus className="h-5 w-5" />}>
        Creating a Workstream
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          From the Workstreams page, click the <strong>New Workstream</strong>{" "}
          button in the top right. A modal will appear with the following
          fields:
        </p>

        <div className="space-y-4 mb-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              1. Name & Description
            </h4>
            <p className="text-sm mb-2">
              Choose a clear, specific name that describes the research focus.
              The description provides context for anyone reviewing your
              workstreams.
            </p>
            <div className="bg-gray-50 dark:bg-dark-surface-elevated rounded-md p-3 text-sm">
              <div className="font-medium text-gray-900 dark:text-white mb-1">
                Good examples:
              </div>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-0.5 text-xs">
                <li>"Smart Mobility Innovations" -- clear, scoped topic</li>
                <li>
                  "Climate Resilience Technology" -- specific domain focus
                </li>
                <li>
                  "AI in Municipal Services Q1 2026" -- time-bounded research
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              2. Strategic Pillars & Goals
            </h4>
            <p className="text-sm">
              Select one or more strategic pillars (e.g., Mobility, Community
              Health) and optionally drill down to specific strategic goals
              within those pillars. This determines the strategic lens through
              which signals are evaluated and filtered.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              3. Maturity Stages & Time Horizon
            </h4>
            <p className="text-sm">
              Filter by maturity stage (1 = Concept through 8 = Declining) and
              time horizon (H1: now-2 years, H2: 2-5 years, H3: 5+ years). For
              forward-looking research, combine early-stage maturity with H2/H3
              horizons to capture emerging signals.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              4. Keywords
            </h4>
            <p className="text-sm">
              Add keywords to fine-tune what signals match this workstream.
              Keywords are used by both the auto-populate function and
              workstream scans to find relevant content.
            </p>
          </div>
        </div>

        <ProTip>
          Start focused, then expand. A narrow workstream with 3-5 specific
          keywords will surface higher-quality results than a broad one. You can
          always edit the filters later from the "Edit Filters" button on the
          Kanban board.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
