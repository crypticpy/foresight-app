/**
 * IssueTagCloud tests — empty state, humanization, link wiring.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IssueTagCloud } from "../dashboard/IssueTagCloud";
import type { IssueTagCount } from "../../types/dashboard";

function renderCloud(data: IssueTagCount[]) {
  return render(
    <MemoryRouter>
      <IssueTagCloud data={data} />
    </MemoryRouter>,
  );
}

describe("IssueTagCloud", () => {
  it("shows the empty-state caption when there are no tags", () => {
    renderCloud([]);
    expect(screen.getByText(/no issue tags assigned/i)).toBeInTheDocument();
  });

  it("humanizes snake_case tag codes", () => {
    renderCloud([{ tag: "cost_of_living", count: 12 }]);
    expect(screen.getByText("Cost Of Living")).toBeInTheDocument();
  });

  it("links each tag to the discover page with a query parameter", () => {
    renderCloud([{ tag: "climate_change", count: 5 }]);
    const link = screen.getByRole("link", { name: /climate change/i });
    expect(link.getAttribute("href")).toBe(
      "/discover?issue_tag=climate_change",
    );
  });

  it("renders all tags in the supplied order", () => {
    renderCloud([
      { tag: "aging_infrastructure", count: 8 },
      { tag: "civic_trust", count: 3 },
      { tag: "grant_funding", count: 1 },
    ]);
    const labels = screen
      .getAllByRole("link")
      .map((el) => el.textContent?.replace(/\d+/g, "").trim());
    expect(labels).toEqual([
      "Aging Infrastructure",
      "Civic Trust",
      "Grant Funding",
    ]);
  });
});
