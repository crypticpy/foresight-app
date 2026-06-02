/**
 * Accordion section 10/10 — naming conventions, focus-area strategy, brief
 * scheduling, archival strategy, research-quality tips, and the
 * research-sprint pro tip.
 *
 * @module pages/GuideWorkstreams/sections/TipsAdvancedUsage
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Star } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function TipsAdvancedUsage() {
  return (
    <Accordion.Item value="tips" id="tips">
      <AccordionTrigger icon={<Star className="h-5 w-5" />}>
        Tips & Advanced Usage
      </AccordionTrigger>
      <AccordionContent>
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Workstream Naming Conventions
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-5">
          <li>
            Use descriptive names: "Smart Traffic Signals" is better than
            "Traffic Research"
          </li>
          <li>
            Add time qualifiers for bounded research: "Q1 2026 Climate Tech
            Review"
          </li>
          <li>
            Prefix with the pillar code for team-wide consistency: "[MC]
            Autonomous Transit"
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Focus Area Strategy
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-5">
          <li>
            <strong>Narrow and deep:</strong> 3-5 specific keywords with a
            single pillar for thorough investigation of a niche topic
          </li>
          <li>
            <strong>Broad and exploratory:</strong> Multiple pillars with
            general keywords to survey an emerging area
          </li>
          <li>
            <strong>Cross-cutting:</strong> Use keywords that span multiple
            pillars to capture interdisciplinary signals (e.g., "digital equity"
            touches technology, housing, and community health)
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Brief Scheduling
        </h4>
        <p className="mb-4">
          Align your brief generation with your organization's cadence. If
          leadership reviews happen monthly, plan to have cards researched in
          Working by mid-month and generate briefs the week before the review.
          Use the version history to show how intelligence evolved between
          briefing cycles.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Portfolio Building for Leadership
        </h4>
        <p className="mb-4">
          Build portfolio exports around specific themes or decisions. For a
          council presentation on infrastructure technology, create a
          workstream, research 5-8 key signals, generate individual briefs, then
          use Bulk Export to create a unified PPTX deck ordered by strategic
          priority.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Archival Strategy
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-5">
          <li>
            <strong>Archive, do not delete:</strong> Move completed signals to
            Archived rather than removing them. They serve as a record of what
            was investigated.
          </li>
          <li>
            <strong>Periodic review:</strong> Review your watched signals
            monthly. Signals that have been dormant for 3+ months can usually be
            archived.
          </li>
          <li>
            <strong>Seasonal cleanup:</strong> At the end of each quarter,
            review all workstreams. Archive those that are complete, and update
            filters on active ones to reflect evolving priorities.
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Maximizing Research Quality
        </h4>
        <div className="rounded-lg bg-gray-50 dark:bg-dark-surface-elevated p-4 mb-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              <strong>Screen first:</strong> Run a Quick Update before
              committing to a Deep Dive to avoid wasting research capacity on
              low-value signals.
            </li>
            <li>
              <strong>Add notes before research:</strong> Write what specific
              questions you want answered. This context helps you evaluate
              research results more effectively.
            </li>
            <li>
              <strong>Layer research:</strong> After a Deep Dive, generate a
              brief to move the card to Ready. If the brief reveals gaps, move
              it back to Working for another round.
            </li>
            <li>
              <strong>Use Check for Updates on watched signals:</strong>{" "}
              Periodically refresh the high-priority signals you're watching to
              catch breaking developments.
            </li>
          </ol>
        </div>

        <ProTip title="Advanced Pattern: Research Sprints">
          For time-sensitive topics, create a dedicated workstream and
          batch-process signals in a single session. Accept 5-10 signals from
          Inbox into Working, run Quick Updates on all of them, then run Deep
          Dives on the top 3-4. This focused approach is more efficient than
          trickling signals through the pipeline over days.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
