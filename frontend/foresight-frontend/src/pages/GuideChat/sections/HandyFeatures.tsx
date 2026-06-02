/**
 * Accordion section 7/8 — voice input, smart suggestions, and @ mentions.
 *
 * @module pages/GuideChat/sections/HandyFeatures
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Mic } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function HandyFeatures() {
  return (
    <Accordion.Item value="features" id="features">
      <AccordionTrigger icon={<Mic className="h-5 w-5" />}>
        Handy Features
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          A few extras make the assistant faster to work with:
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>Voice input</strong> -- tap the microphone in the message
            box to speak your question instead of typing it.
          </li>
          <li>
            <strong>Smart suggestions</strong> -- after an answer, suggested
            follow-up questions appear. Click one to keep the thread going
            without typing.
          </li>
          <li>
            <strong>Mentions</strong> -- type <strong>@</strong> to reference a
            specific signal or workstream by name and pull it directly into your
            question.
          </li>
        </ul>
      </AccordionContent>
    </Accordion.Item>
  );
}
