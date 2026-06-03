/**
 * Accordion section 5/8 — reading answers, citations, and verifying claims.
 *
 * @module pages/GuideChat/sections/UnderstandingAnswers
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Quote } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function UnderstandingAnswers() {
  return (
    <Accordion.Item value="answers" id="answers">
      <AccordionTrigger icon={<Quote className="h-5 w-5" />}>
        Understanding the Answers
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Answers are written to be read by a busy person -- a short synthesis
          first, with detail underneath. Two things to know:
        </p>
        <ul className="list-disc list-inside space-y-2 mb-4">
          <li>
            <strong>Citations</strong> -- numbered references point to the
            signals and sources the answer is built from. Click one to open the
            underlying signal or web page.
          </li>
          <li>
            <strong>Web results when needed</strong> -- if your question calls
            for the latest information, the assistant can search the web and
            cite what it finds, right alongside your own signals.
          </li>
        </ul>
        <p className="mb-4">
          If it doesn't have enough information to answer well, it will tell you
          rather than guess.
        </p>
        <ProTip defaultOpen>
          AI can occasionally misread a source. For anything that will inform a
          decision, open the citation and confirm the claim against the original
          before you act on it.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
