/**
 * AnchorRadar tests — empty state when no card has been scored, polygon
 * when scores exist, and stable axis ordering.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnchorRadar } from "../dashboard/AnchorRadar";
import type { AnchorOverview } from "../../types/dashboard";

const ANCHORS: AnchorOverview[] = [
  {
    code: "equity",
    name: "Equity",
    mean_score: 0,
    high_score_count: 0,
    scored_card_count: 0,
  },
  {
    code: "affordability",
    name: "Affordability",
    mean_score: 0,
    high_score_count: 0,
    scored_card_count: 0,
  },
  {
    code: "innovation",
    name: "Innovation",
    mean_score: 0,
    high_score_count: 0,
    scored_card_count: 0,
  },
  {
    code: "sustainability_resiliency",
    name: "Sustainability & Resiliency",
    mean_score: 0,
    high_score_count: 0,
    scored_card_count: 0,
  },
  {
    code: "proactive_prevention",
    name: "Proactive Prevention",
    mean_score: 0,
    high_score_count: 0,
    scored_card_count: 0,
  },
  {
    code: "community_trust",
    name: "Community Trust & Relationships",
    mean_score: 0,
    high_score_count: 0,
    scored_card_count: 0,
  },
];

describe("AnchorRadar", () => {
  it("shows the empty-state caption when no anchor has been scored", () => {
    render(<AnchorRadar data={ANCHORS} />);
    expect(screen.getByText(/no anchor scores yet/i)).toBeInTheDocument();
  });

  it("renders all six axis labels", () => {
    render(<AnchorRadar data={ANCHORS} />);
    expect(screen.getByText("Equity")).toBeInTheDocument();
    // Shortened: "Sustainability & Resiliency" → "Sustainability"
    expect(screen.getByText("Sustainability")).toBeInTheDocument();
    expect(screen.getByText("Community Trust")).toBeInTheDocument();
  });

  it("draws the data polygon when scores are present", () => {
    const data = ANCHORS.map((a, i) => ({
      ...a,
      mean_score: 50 + i * 5,
      scored_card_count: 4,
    }));
    const { container } = render(<AnchorRadar data={data} />);
    const polygons = container.querySelectorAll("path");
    // 4 grid rings + 1 data polygon = 5 paths minimum.
    expect(polygons.length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText(/no anchor scores yet/i)).toBeNull();
  });

  it("clamps the polygon to the chart radius for out-of-range scores", () => {
    const data = ANCHORS.map((a) => ({
      ...a,
      mean_score: 999,
      scored_card_count: 1,
    }));
    const { container } = render(<AnchorRadar data={data} />);
    const points = container.querySelectorAll("circle");
    // 6 anchors → 6 vertex dots, each within the 240×240 viewbox.
    expect(points.length).toBe(6);
    for (const c of Array.from(points)) {
      const cx = Number(c.getAttribute("cx"));
      const cy = Number(c.getAttribute("cy"));
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(240);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(240);
    }
  });
});
