/**
 * Accordion section 6/10 — generating an executive brief, the canonical
 * structure, version history, and the new-sources indicator.
 *
 * @module pages/GuideWorkstreams/sections/ExecutiveBriefs
 */

import * as Accordion from "@radix-ui/react-accordion";
import { FileText } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";
import { BriefStructurePreview } from "../BriefStructurePreview";

export function ExecutiveBriefs() {
  return (
    <Accordion.Item value="briefs" id="briefs">
      <AccordionTrigger icon={<FileText className="h-5 w-5" />}>
        Executive Briefs
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Executive briefs are the primary deliverable of the workstream system.
          They synthesize research into structured, leadership-ready documents
          that can be shared with decision-makers.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Generating a Brief
        </h4>
        <ol className="list-decimal list-inside space-y-1 mb-4">
          <li>
            Move a card to the <strong>Ready</strong> column (ensure it has
            research data first)
          </li>
          <li>
            Click the <strong>Generate Brief</strong> action in the card's menu
          </li>
          <li>
            The AI analyzes all attached research and synthesizes a structured
            brief
          </li>
          <li>A preview modal opens automatically when generation completes</li>
        </ol>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Brief Structure
        </h4>
        <BriefStructurePreview />

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-2">
          Version History
        </h4>
        <p className="mb-3">
          Every time you generate or regenerate a brief, a new version is
          created. The preview modal includes a collapsible version history
          panel where you can:
        </p>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>View all previous versions with timestamps</li>
          <li>Switch between versions to compare content</li>
          <li>
            See how many new sources were available since the previous version
          </li>
          <li>Regenerate with the latest data at any time</li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          New Sources Indicator
        </h4>
        <p className="mb-4">
          When new research sources become available after a brief was
          generated, a badge appears on the Regenerate button showing how many
          new sources are available. This helps you decide when to create a
          fresh version with the latest intelligence.
        </p>

        <ProTip defaultOpen>
          Run Deep Dive research before generating a brief. The brief quality is
          directly proportional to the research data available. A card that has
          been through both Quick Update and Deep Dive will produce a
          significantly richer brief than one with only initial discovery data.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
