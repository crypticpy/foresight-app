/**
 * CspHeatmap tests — pillar grouping, empty rows, click handler.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CspHeatmap } from "../dashboard/CspHeatmap";
import type { CspGoalCoverage } from "../../types/dashboard";

const SAMPLE: CspGoalCoverage[] = [
  {
    goal_id: "g1",
    code: "CH.1",
    name: "Equitable health outcomes",
    pillar_code: "CH",
    card_count: 3,
  },
  {
    goal_id: "g2",
    code: "CH.2",
    name: "Resilient environment",
    pillar_code: "CH",
    card_count: 1,
  },
  {
    goal_id: "g3",
    code: "PS.1",
    name: "Equitable public safety",
    pillar_code: "PS",
    card_count: 7,
  },
];

describe("CspHeatmap", () => {
  it("renders all six pillar rows even when some have no goals", () => {
    render(<CspHeatmap data={SAMPLE} />);
    for (const code of ["CH", "EW", "HG", "HH", "MC", "PS"]) {
      expect(screen.getAllByText(code).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/no coverage/i).length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it("shows each goal's code and card count", () => {
    render(<CspHeatmap data={SAMPLE} />);
    expect(screen.getByText("CH.1")).toBeInTheDocument();
    expect(screen.getByText("PS.1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders cells as buttons when onGoalClick is provided", () => {
    const handleClick = vi.fn();
    render(<CspHeatmap data={SAMPLE} onGoalClick={handleClick} />);
    const button = screen.getByLabelText(/CH\.1.*3 cards/);
    expect(button.tagName).toBe("BUTTON");
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick.mock.calls[0]?.[0]?.code).toBe("CH.1");
  });

  it("does not render buttons when no click handler is provided", () => {
    render(<CspHeatmap data={SAMPLE} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
