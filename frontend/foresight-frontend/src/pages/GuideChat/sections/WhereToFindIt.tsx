/**
 * Accordion section 2/8 — the three places Ask Foresight appears in the app.
 *
 * @module pages/GuideChat/sections/WhereToFindIt
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Compass } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function WhereToFindIt() {
  return (
    <Accordion.Item value="where" id="where">
      <AccordionTrigger icon={<Compass className="h-5 w-5" />}>
        Where to Find It
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Ask Foresight shows up in three places. Each one automatically points
          the assistant at the right material, so you rarely have to think about
          setup.
        </p>
        <ul className="list-disc list-inside space-y-2 mb-4">
          <li>
            <strong>The Ask page</strong> -- click <strong>Ask</strong> in the
            top navigation (the sparkle icon). This is the full-screen home for
            open-ended exploration, with a sidebar of your past conversations.
          </li>
          <li>
            <strong>On a signal</strong> -- open any signal and use its chat to
            ask questions about that specific signal and its research.
          </li>
          <li>
            <strong>Inside a workstream</strong> -- the workstream chat panel
            answers using only the signals in that workstream, so it stays
            focused on your research area.
          </li>
        </ul>
        <p>
          Wherever you open it, the conversation works the same way -- the only
          difference is how much of Foresight the assistant is looking at, which
          we call the <strong>scope</strong>.
        </p>
      </AccordionContent>
    </Accordion.Item>
  );
}
