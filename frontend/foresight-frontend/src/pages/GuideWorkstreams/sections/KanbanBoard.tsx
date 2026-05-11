/**
 * Accordion section 3/10 — explains the six-column Kanban board, with the
 * interactive column explainer embedded.
 *
 * @module pages/GuideWorkstreams/sections/KanbanBoard
 */

import * as Accordion from "@radix-ui/react-accordion";
import { ClipboardList } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";
import { InteractiveKanban } from "../InteractiveKanban";

export function KanbanBoard() {
  return (
    <Accordion.Item value="kanban" id="kanban">
      <AccordionTrigger icon={<ClipboardList className="h-5 w-5" />}>
        The Kanban Board
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Each workstream has a six-column Kanban board that represents the full
          lifecycle of a research signal. Cards move from left to right as they
          progress through investigation, and each column unlocks specific
          AI-powered actions.
        </p>

        <InteractiveKanban />

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-2">
          Moving Cards
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            <strong>Drag and drop</strong> -- Click and hold a card, then drag
            it to another column. Release to drop it in position.
          </li>
          <li>
            <strong>Context menu</strong> -- Open the card's action menu
            (three-dot icon) and select "Move to..." to choose the destination
            column.
          </li>
          <li>
            <strong>Within-column reordering</strong> -- Drag cards up or down
            within the same column to change their priority order.
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Card Actions Available Everywhere
        </h4>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Notes</strong> -- Add context-specific notes to any card.
            Notes are scoped to this workstream and do not appear on other
            workstreams that include the same signal.
          </li>
          <li>
            <strong>Remove</strong> -- Remove a card from this workstream. The
            underlying signal is not deleted and can be re-added later.
          </li>
          <li>
            <strong>View Details</strong> -- Click the card to navigate to the
            full signal detail page.
          </li>
        </ul>

        <ProTip title="Keyboard Accessibility">
          The Kanban board supports keyboard navigation. Use Tab to focus cards,
          Enter to activate drag mode, and arrow keys to move cards between
          columns. Press Escape to cancel a drag operation.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
