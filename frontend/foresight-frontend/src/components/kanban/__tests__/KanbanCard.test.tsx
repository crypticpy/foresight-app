/**
 * KanbanCard accessibility tests.
 *
 * Guards the drag-handle refactor: the card must expose a single, labelled
 * keyboard drag handle, the card root must NOT be a second nested focusable
 * button (WCAG 4.1.2), and the card body must still open the signal on Enter.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { KanbanCard } from "../KanbanCard";
import type { WorkstreamCard } from "../types";

function makeCard(): WorkstreamCard {
  return {
    id: "wsc-1",
    card_id: "card-1",
    status: "inbox",
    position: 0,
    workstream_id: "ws-1",
    added_at: new Date().toISOString(),
    added_from: "manual",
    notes: null,
    reminder_at: null,
    review_status: "approved",
    is_watching: false,
    card: {
      id: "card-1",
      slug: "test-signal",
      name: "Test Signal",
      summary: "A short summary",
      pillar_id: "MC",
      stage_id: "2_exploring",
      horizon: "H2",
      is_exploratory: false,
      signal_quality_score: 80,
      velocity_trend: "stable",
      velocity_score: 50,
      artifacts: [],
      top25_relevance: [],
    },
  } as unknown as WorkstreamCard;
}

function renderCard(props: { onCardClick?: (c: WorkstreamCard) => void } = {}) {
  const card = makeCard();
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <DndContext>
          <SortableContext items={[card.id]}>
            <KanbanCard card={card} {...props} />
          </SortableContext>
        </DndContext>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("KanbanCard accessibility", () => {
  it("exposes a labelled keyboard drag handle", () => {
    renderCard();
    const handle = screen.getByRole("button", { name: /^Reorder/i });
    expect(handle).toBeInTheDocument();
    expect(handle.getAttribute("aria-label") ?? "").toContain("arrow keys");
  });

  it("does not make the card root a second focusable button", () => {
    const { container } = renderCard();
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    // The root carries pointer drag listeners but must not itself be a
    // focusable role="button" wrapping the content button.
    expect(root.getAttribute("role")).not.toBe("button");
    expect(root).not.toHaveAttribute("tabindex");
  });

  it("opens the card from the body on Enter", () => {
    const onCardClick = vi.fn();
    const { container } = renderCard({ onCardClick });
    const body = container.querySelector(
      '[data-kanban-card="wsc-1"]',
    ) as HTMLElement;
    expect(body).not.toBeNull();
    fireEvent.keyDown(body, { key: "Enter" });
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });
});
