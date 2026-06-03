/**
 * Accordion section 3/10 — explains the four-column Kanban board, with the
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
          Each workstream has a four-column Kanban board -- Inbox, Working,
          Ready, and Archived -- that tracks a signal from first sighting to a
          leadership-ready artifact. Cards move left to right as you investigate
          them. The AI-powered actions live on each card's action menu and the
          selection toolbar, so they're available wherever a card sits -- not
          gated behind a particular column.
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

        <ProTip title="Keyboard Accessibility" defaultOpen>
          You don't need a mouse to move cards. Each card has a drag handle --
          the grip icon that appears at the top of the card when you hover over
          it or focus it with the keyboard. Tab to a card's drag handle, press
          Space or Enter to pick the card up, use the arrow keys to move it
          between columns, then press Space or Enter again to drop it (Escape
          cancels). To open a card instead of moving it, focus the card body and
          press Enter.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
