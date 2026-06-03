/**
 * Accordion section 7/10 — export workflow, individual brief formats, and
 * bulk portfolio export.
 *
 * @module pages/GuideWorkstreams/sections/ExportingPresentations
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Download, FileText, GripVertical, Presentation } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";
import { ExportWorkflowDiagram } from "../ExportWorkflowDiagram";

export function ExportingPresentations() {
  return (
    <Accordion.Item value="exporting" id="exporting">
      <AccordionTrigger icon={<Download className="h-5 w-5" />}>
        Exporting & Presentations
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Foresight's export system is designed to bridge the gap between
          research and action. It supports both individual brief exports and
          multi-brief portfolio documents, all branded with the City of Austin
          identity.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Export Workflow
        </h4>
        <ExportWorkflowDiagram />

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-2">
          Individual Brief Export
        </h4>
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-red-500" />
              <h5 className="font-semibold text-gray-900 dark:text-white">
                PDF
              </h5>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Formatted document optimized for printing, email attachments, and
              official records. Includes structured headings, clean typography,
              and City of Austin branding elements.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Best for: Documentation, file sharing, meeting pre-reads
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Presentation className="h-5 w-5 text-orange-500" />
              <h5 className="font-semibold text-gray-900 dark:text-white">
                PowerPoint (PPTX)
              </h5>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Presentation-ready slides generated from the brief content. Each
              section becomes a slide with key points and supporting details
              formatted for visual impact.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Best for: Leadership presentations, council briefings, stakeholder
              meetings
            </p>
          </div>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Bulk Portfolio Export
        </h4>
        <p className="mb-3">
          For comprehensive briefing packages, the Bulk Export feature lets you
          combine multiple briefs from the Ready column into a single cohesive
          document:
        </p>
        <ol className="list-decimal list-inside space-y-1 mb-4">
          <li>
            Click the <strong>Bulk Export</strong> button in the Ready column
            header
          </li>
          <li>
            Select which cards to include (only cards with generated briefs are
            eligible)
          </li>
          <li>
            <strong>Drag to reorder</strong> the cards using the grip handle (
            <GripVertical className="h-3.5 w-3.5 inline text-gray-400" />) to
            set the presentation sequence
          </li>
          <li>Choose your export format (PDF or PPTX)</li>
          <li>
            The AI synthesizes all selected briefs into a unified portfolio with
            a cohesive introduction and transitions
          </li>
        </ol>

        <div className="bg-gradient-to-r from-brand-blue/10 to-brand-green/10 dark:from-brand-blue/15 dark:to-brand-green/15 rounded-lg p-4 border border-brand-blue/20 mb-4">
          <h5 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
            City of Austin Branding
          </h5>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            All exported documents automatically include City of Austin branding
            elements including logos, color schemes, and standardized
            header/footer layouts suitable for official distribution.
          </p>
        </div>

        <ProTip defaultOpen>
          Use bulk export when preparing for quarterly strategic reviews or
          presenting to the City Manager's office. Order the briefs from highest
          priority to lowest, and the AI will create smooth transitions between
          topics in the synthesized document.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
