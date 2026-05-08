/**
 * SignalTypeDonut tests — empty state, single-bucket full-ring case,
 * stable bucket ordering in the legend.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignalTypeDonut } from "../dashboard/SignalTypeDonut";
import type { SignalTypeMix } from "../../types/dashboard";

const ZERO: SignalTypeMix[] = [
  { signal_type: "trend", count: 0 },
  { signal_type: "driver", count: 0 },
  { signal_type: "signal", count: 0 },
  { signal_type: "unclassified", count: 0 },
];

describe("SignalTypeDonut", () => {
  it("renders the legend in fixed order regardless of input order", () => {
    render(
      <SignalTypeDonut
        data={[
          { signal_type: "unclassified", count: 1 },
          { signal_type: "signal", count: 2 },
          { signal_type: "trend", count: 3 },
          { signal_type: "driver", count: 4 },
        ]}
      />,
    );
    const labels = screen
      .getAllByText(/^(Trend|Driver|Signal|Unclassified)$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(["Trend", "Driver", "Signal", "Unclassified"]);
  });

  it("shows the empty-state aria label when the corpus is empty", () => {
    const { container } = render(<SignalTypeDonut data={ZERO} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toMatch(/no cards classified yet/i);
  });

  it("renders a total-count text node when there's data", () => {
    render(
      <SignalTypeDonut
        data={[
          { signal_type: "trend", count: 6 },
          { signal_type: "driver", count: 2 },
          { signal_type: "signal", count: 0 },
          { signal_type: "unclassified", count: 0 },
        ]}
      />,
    );
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("draws a full-ring slice when only one bucket has data", () => {
    const { container } = render(
      <SignalTypeDonut
        data={[
          { signal_type: "driver", count: 5 },
          { signal_type: "trend", count: 0 },
          { signal_type: "signal", count: 0 },
          { signal_type: "unclassified", count: 0 },
        ]}
      />,
    );
    // Full ring path is glued from two semicircles; check both are present.
    const dataPaths = container.querySelectorAll("svg path");
    // At least the background ring + one full-ring data slice.
    expect(dataPaths.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("100%", { exact: false })).toBeInTheDocument();
  });
});
