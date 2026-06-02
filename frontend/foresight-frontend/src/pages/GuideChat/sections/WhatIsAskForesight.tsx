/**
 * Accordion section 1/8 — what Ask Foresight is and why it is different
 * from a generic chatbot.
 *
 * @module pages/GuideChat/sections/WhatIsAskForesight
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Sparkles } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function WhatIsAskForesight() {
  return (
    <Accordion.Item value="what" id="what">
      <AccordionTrigger icon={<Sparkles className="h-5 w-5" />}>
        What is Ask Foresight?
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Ask Foresight is the built-in AI research assistant. You ask questions
          in plain English, and it answers using the intelligence already in
          your Foresight account -- your signals, their research, and your
          briefs -- along with the open web when a question needs the latest
          information.
        </p>
        <p className="mb-4">
          It is not a generic chatbot. Every answer is grounded in real
          Foresight content and comes with citations you can open and check.
          Behind the scenes it finds the most relevant material, reads it, and
          writes a synthesized answer -- the way a briefing analyst who has read
          every signal would.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          What it is good for
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            Getting oriented quickly on a topic without reading every signal
          </li>
          <li>Summarizing or comparing across many signals at once</li>
          <li>
            Spotting connections between signals and your strategic priorities
          </li>
          <li>
            Drafting talking points, summaries, and plain-English explainers
          </li>
        </ul>

        <ProTip>
          Think of Ask Foresight as an analyst who has read your whole signal
          library. The more clearly you describe what you need, the more useful
          the answer.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
