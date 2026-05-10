/**
 * Methodology accordion section 5/6 — user-generated content (quick create
 * vs manual form) and how it integrates with the AI quality pipeline.
 *
 * @module pages/Methodology/sections/UserContent
 */

import * as Accordion from "@radix-ui/react-accordion";
import { PenSquare } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function UserContent() {
  return (
    <Accordion.Item value="user-content" id="user-content">
      <AccordionTrigger icon={<PenSquare className="h-5 w-5" />}>
        User-Generated Content
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Users can create cards for topics not covered by automated discovery.
          User-created cards are clearly labeled with their origin and undergo
          the same quality assessment as discovered cards.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Creation Modes
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            <span className="font-medium">Quick create</span> &mdash; enter a
            topic phrase and the system generates the full card via AI analysis
          </li>
          <li>
            <span className="font-medium">Manual form</span> &mdash; fill out
            structured fields for pillar, stage, summary, and scores
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Additional Capabilities
        </h4>
        <ul className="list-disc list-inside space-y-1">
          <li>Exploratory cards for topics outside predefined pillars</li>
          <li>
            Source seeding &mdash; users can provide URLs for AI analysis and
            context gathering
          </li>
          <li>
            All user-created cards are quality-scored once sources are attached
          </li>
        </ul>
      </AccordionContent>
    </Accordion.Item>
  );
}
