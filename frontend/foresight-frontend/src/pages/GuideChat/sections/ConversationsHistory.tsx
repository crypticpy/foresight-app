/**
 * Accordion section 6/8 — saved conversations, search, and starting fresh.
 *
 * @module pages/GuideChat/sections/ConversationsHistory
 */

import * as Accordion from "@radix-ui/react-accordion";
import { History } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function ConversationsHistory() {
  return (
    <Accordion.Item value="conversations" id="conversations">
      <AccordionTrigger icon={<History className="h-5 w-5" />}>
        Conversations & History
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Your conversations are saved automatically, so you can pick up a line
          of inquiry days later. On the Ask page, the sidebar holds your full
          history.
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>Revisit</strong> -- click any past conversation in the
            sidebar to reopen it and keep going.
          </li>
          <li>
            <strong>Search</strong> -- use the search box to find an earlier
            conversation by keyword.
          </li>
          <li>
            <strong>New Chat</strong> -- start a fresh conversation when you
            switch topics, so earlier context doesn't bleed into the new one.
          </li>
          <li>
            <strong>Delete</strong> -- remove a conversation you no longer need.
          </li>
        </ul>
      </AccordionContent>
    </Accordion.Item>
  );
}
