/**
 * Sparkline tests — geometry edge cases (empty / single point / flat
 * series) plus accessibility surface.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkline } from "../dashboard/Sparkline";

describe("Sparkline", () => {
  it("renders an svg with no path when data is empty", () => {
    const { container } = render(<Sparkline data={[]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelector("circle")).toBeNull();
  });

  it("renders a centered dot for a single-point series", () => {
    const { container } = render(
      <Sparkline data={[{ date: "2026-05-01", value: 7 }]} />,
    );
    const circle = container.querySelector("circle");
    expect(circle).toBeInTheDocument();
    expect(circle?.getAttribute("cx")).toBe("50");
  });

  it("draws a flat line at mid-height when all values are equal", () => {
    const data = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-05-0${i + 1}`,
      value: 3,
    }));
    const { container } = render(<Sparkline data={data} />);
    const linePath = container.querySelectorAll("path")[1];
    expect(linePath).toBeDefined();
    // All Y coordinates should equal VIEW_H / 2 = 16.
    const d = linePath?.getAttribute("d") ?? "";
    const yMatches = Array.from(d.matchAll(/[ML]\s[\d.]+\s([\d.]+)/g));
    const yValues = yMatches.map((m) => Number(m[1]));
    expect(yValues.length).toBeGreaterThan(0);
    for (const y of yValues) expect(y).toBeCloseTo(16, 5);
  });

  it("places the trailing dot at the rightmost x", () => {
    const data = [
      { date: "2026-05-01", value: 1 },
      { date: "2026-05-02", value: 4 },
      { date: "2026-05-03", value: 2 },
    ];
    const { container } = render(<Sparkline data={data} />);
    const circle = container.querySelector("circle");
    expect(circle?.getAttribute("cx")).toBe("100");
  });

  it("exposes an aria-label that summarizes totals", () => {
    render(
      <Sparkline
        data={[
          { date: "2026-05-01", value: 2 },
          { date: "2026-05-02", value: 3 },
        ]}
      />,
    );
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toMatch(/5 events over 2 days/);
  });
});
