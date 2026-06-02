/**
 * Accordion section 3/8 — what "scope" means and how to choose it.
 *
 * @module pages/GuideChat/sections/ChoosingScope
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Globe } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function ChoosingScope() {
  return (
    <Accordion.Item value="scope" id="scope">
      <AccordionTrigger icon={<Globe className="h-5 w-5" />}>
        Choosing a Scope
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Scope is simply how much of Foresight the assistant reads before it
          answers. There are three levels:
        </p>
        <ul className="list-disc list-inside space-y-2 mb-4">
          <li>
            <strong>All Signals</strong> -- the entire intelligence base. Best
            for broad questions like "what's emerging across public safety?"
          </li>
          <li>
            <strong>A workstream</strong> -- only the signals in that
            workstream. Best for focused questions about one research area.
          </li>
          <li>
            <strong>A single signal</strong> -- just that signal and its
            research. Best for "explain this one to me" questions.
          </li>
        </ul>
        <p className="mb-4">
          On the Ask page, use the scope button in the top-left to switch
          between <strong>All Signals</strong> and any workstream you own. On a
          signal or inside a workstream, the scope is already set for you.
        </p>
        <ProTip>
          Narrower scope usually means sharper, faster, more relevant answers.
          When your question is about one topic, scope to that workstream rather
          than All Signals.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
