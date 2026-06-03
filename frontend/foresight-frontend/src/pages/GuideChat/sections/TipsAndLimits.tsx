/**
 * Accordion section 8/8 — usage limits and getting the most out of chat.
 *
 * @module pages/GuideChat/sections/TipsAndLimits
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Star } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function TipsAndLimits() {
  return (
    <Accordion.Item value="tips" id="tips">
      <AccordionTrigger icon={<Star className="h-5 w-5" />}>
        Tips & Limits
      </AccordionTrigger>
      <AccordionContent>
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Usage limits
        </h4>
        <p className="mb-4">
          To keep responses fast and costs predictable during the pilot, there
          are gentle daily limits on how many chat sessions you can start and
          how many back-and-forth turns a single conversation can run. When a
          long conversation reaches its turn limit, you'll see a prompt to
          continue in a fresh chat -- just start a new one and carry on.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Getting the most out of it
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            <strong>Scope tightly</strong> -- a workstream-scoped chat gives
            sharper answers than All Signals for a focused topic.
          </li>
          <li>
            <strong>Use it to get oriented, then read the source</strong> --
            chat complements the signal detail and the executive brief; it
            doesn't replace reading them before a decision.
          </li>
          <li>
            <strong>Iterate</strong> -- treat the first answer as a draft and
            refine it with follow-ups.
          </li>
        </ul>

        <ProTip defaultOpen>
          Paste a dense or jargon-heavy paragraph from a signal and ask "explain
          this in plain English." It's one of the fastest ways to make a
          technical signal accessible to the whole team.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
