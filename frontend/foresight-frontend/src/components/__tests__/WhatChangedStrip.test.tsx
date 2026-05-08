/**
 * WhatChangedStrip tests — quiet state, chip filtering, link wiring.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WhatChangedStrip } from "../dashboard/WhatChangedStrip";
import type { LensDelta24h } from "../../types/dashboard";

function renderStrip(delta: LensDelta24h | null) {
  return render(
    <MemoryRouter>
      <WhatChangedStrip delta={delta} />
    </MemoryRouter>,
  );
}

const ZERO: LensDelta24h = {
  new_cards: 0,
  new_classifications: 0,
  new_follows: 0,
  new_workstream_cards: 0,
};

describe("WhatChangedStrip", () => {
  it("renders nothing when delta is null", () => {
    const { container } = renderStrip(null);
    expect(container.firstChild).toBeNull();
  });

  it("renders the quiet caption when every counter is zero", () => {
    renderStrip(ZERO);
    expect(screen.getByText(/quiet/i)).toBeInTheDocument();
  });

  it("renders only chips with non-zero counts", () => {
    renderStrip({
      new_cards: 3,
      new_classifications: 0,
      new_follows: 0,
      new_workstream_cards: 1,
    });
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText(/quiet/i)).toBeNull();
  });

  it("uses singular labels for count of one", () => {
    renderStrip({
      new_cards: 1,
      new_classifications: 1,
      new_follows: 1,
      new_workstream_cards: 1,
    });
    expect(screen.getByText("new card")).toBeInTheDocument();
    expect(screen.getByText("new follow")).toBeInTheDocument();
    expect(screen.getByText("added to a workstream")).toBeInTheDocument();
  });

  it("uses plural labels for counts > 1", () => {
    renderStrip({
      new_cards: 5,
      new_classifications: 0,
      new_follows: 0,
      new_workstream_cards: 0,
    });
    expect(screen.getByText("new cards")).toBeInTheDocument();
  });
});
