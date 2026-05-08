/**
 * FlagsRow tests — both tiles render with their counts and links.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FlagsRow } from "../dashboard/FlagsRow";

function renderFlags(budget: number, climate: number) {
  return render(
    <MemoryRouter>
      <FlagsRow budgetFlagCount={budget} climateFlagCount={climate} />
    </MemoryRouter>,
  );
}

describe("FlagsRow", () => {
  it("renders both tiles with the supplied counts", () => {
    renderFlags(7, 3);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Budget-relevant")).toBeInTheDocument();
    expect(screen.getByText("Climate-relevant")).toBeInTheDocument();
  });

  it("links each tile to the appropriate Discover filter", () => {
    renderFlags(0, 0);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/discover?flag=budget");
    expect(hrefs).toContain("/discover?flag=climate");
  });

  it("renders zero counts without crashing", () => {
    renderFlags(0, 0);
    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(2);
  });
});
