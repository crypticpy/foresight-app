/**
 * Accordion section 4/8 — how to phrase questions, with worked examples.
 *
 * @module pages/GuideChat/sections/AskingGoodQuestions
 */

import * as Accordion from "@radix-ui/react-accordion";
import { MessageSquare } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function AskingGoodQuestions() {
  return (
    <Accordion.Item value="questions" id="questions">
      <AccordionTrigger icon={<MessageSquare className="h-5 w-5" />}>
        Asking Good Questions
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Plain language works -- you don't need special syntax or keywords. A
          few habits make answers noticeably better:
        </p>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            <strong>Say what you want back</strong> -- a summary, a comparison,
            the key risks, talking points, a plain-English explanation.
          </li>
          <li>
            <strong>Add context</strong> -- "for a council briefing," "in two
            sentences," "for someone non-technical."
          </li>
          <li>
            <strong>Ask follow-ups</strong> -- the assistant remembers the
            conversation, so you can refine instead of starting over.
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Example questions
        </h4>
        <div className="rounded-lg bg-gray-50 dark:bg-dark-surface-elevated p-4 mb-2">
          <ul className="space-y-2 text-sm">
            <li>"What are the top emerging mobility signals this quarter?"</li>
            <li>
              "Summarize the risks in this signal for a non-technical audience."
            </li>
            <li>
              "How do these housing signals connect to our affordability
              priority?"
            </li>
            <li>
              "Draft three talking points for leadership from this workstream."
            </li>
          </ul>
        </div>
      </AccordionContent>
    </Accordion.Item>
  );
}
