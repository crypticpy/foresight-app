/**
 * KanbanColumn virtualization tests.
 *
 * jsdom can't measure real DOM heights, so the established pattern (see
 * VirtualizedList.test.tsx) is to skip "exactly N visible rows" assertions
 * and instead verify the structural wiring: that the virtualizer creates a
 * relative-positioned content container sized by getTotalSize, and that the
 * column does NOT mount every card eagerly when the dataset is large.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { KanbanColumn } from "../KanbanColumn";
import type { WorkstreamCard } from "../types";

vi.mock("../KanbanCard", () => ({
  KanbanCard: ({ card }: { card: WorkstreamCard }) => (
    <div data-testid={`card-${card.id}`}>{card.card_id}</div>
  ),
}));

function makeCard(idx: number): WorkstreamCard {
  return {
    id: `wsc-${idx}`,
    card_id: `card-${idx}`,
    status: "inbox",
    position: idx,
    workstream_id: "ws-1",
    added_at: new Date().toISOString(),
    is_watching: false,
    card: {
      id: `card-${idx}`,
      slug: `slug-${idx}`,
      title: `Card ${idx}`,
      summary: "",
      pillar: "MC",
      stage: "Exploring",
      horizon: "Near-term",
      impact_score: 50,
      relevance_score: 50,
      velocity_score: 50,
      novelty_score: 50,
      opportunity_score: 50,
      risk_score: 50,
      created_at: new Date().toISOString(),
    },
  } as unknown as WorkstreamCard;
}

describe("KanbanColumn virtualization", () => {
  it("renders the empty state when there are no cards", () => {
    const { getByText } = render(
      <KanbanColumn
        id="inbox"
        title="Inbox"
        description="New signals"
        cards={[]}
      />,
    );
    expect(getByText("No signals in this column")).toBeInTheDocument();
  });

  it("creates a virtualizer content container sized to the full card list", () => {
    const cards = Array.from({ length: 100 }, (_, i) => makeCard(i));
    const { container } = render(
      <KanbanColumn
        id="inbox"
        title="Inbox"
        description="New signals"
        cards={cards}
      />,
    );

    const virtualContent = container.querySelector(
      '[style*="position: relative"]',
    ) as HTMLElement | null;
    expect(virtualContent).not.toBeNull();
    // estimateSize is 180 with a 12px gap → total ≥ 100 * 180. jsdom can't
    // measure, so it falls through to estimateSize for every row.
    const heightAttr = virtualContent?.style.height ?? "";
    const heightPx = parseInt(heightAttr.replace("px", ""), 10);
    expect(heightPx).toBeGreaterThanOrEqual(100 * 180);
  });

  it("does not mount every card when the dataset is large", () => {
    const cards = Array.from({ length: 100 }, (_, i) => makeCard(i));
    const { queryAllByTestId } = render(
      <KanbanColumn
        id="inbox"
        title="Inbox"
        description="New signals"
        cards={cards}
      />,
    );
    // Virtualization should mount strictly fewer than the full set. In jsdom
    // the scroll element measures as zero, so the virtualizer typically
    // mounts only overscan rows.
    const mounted = queryAllByTestId(/^card-wsc-\d+$/);
    expect(mounted.length).toBeLessThan(cards.length);
  });
});
