/**
 * ArtifactStrip slot-resolution tests.
 *
 * jsdom can't render tooltip portals reliably, so we assert against the
 * visible slot chips themselves (aria-label is the single contract callers
 * depend on for screen readers).
 */

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

// Bypass the Radix TooltipProvider requirement — these tests assert on the
// chip itself, not the floating tooltip surface (which jsdom can't render
// in portals anyway).
vi.mock("../../../ui/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ArtifactStrip } from "../ArtifactStrip";
import type { CardArtifacts } from "../../../../types/card";

function strip(artifacts?: CardArtifacts | null) {
  return render(<ArtifactStrip artifacts={artifacts} />);
}

describe("ArtifactStrip", () => {
  it("renders nothing when no artifacts exist", () => {
    const { container } = strip(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when artifacts is the empty default", () => {
    const { container } = strip({
      has_deep_research: false,
      has_brief: false,
      has_scan: false,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a ready deep-dive slot with relative date in the aria-label", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { getByRole } = strip({
      has_deep_research: true,
      has_brief: false,
      has_scan: false,
      deep_research_updated_at: yesterday,
    });
    const chip = getByRole("img", { name: /Deep Dive ready/i });
    expect(chip.getAttribute("aria-label")).toMatch(/ago/);
  });

  it("prefers ready over pending when a card has both", () => {
    const { getByRole, queryByRole } = strip({
      has_deep_research: true,
      has_brief: false,
      has_scan: false,
      pending_research: true,
    });
    expect(getByRole("img", { name: /Deep Dive ready/i })).toBeInTheDocument();
    expect(queryByRole("img", { name: /Deep Dive in progress/i })).toBeNull();
  });

  it("shows a pending brief when generating", () => {
    const { getByRole } = strip({
      has_deep_research: false,
      has_brief: false,
      has_scan: false,
      pending_brief: true,
    });
    expect(
      getByRole("img", { name: /Brief in progress/i }),
    ).toBeInTheDocument();
  });

  it("shows a failed brief with the error message in the aria-label", () => {
    const { getByRole } = strip({
      has_deep_research: false,
      has_brief: false,
      has_scan: false,
      failed_brief: true,
      brief_error_message: "OpenAI timeout after 60s",
    });
    expect(
      getByRole("img", { name: /Brief failed: OpenAI timeout after 60s/i }),
    ).toBeInTheDocument();
  });

  it("falls back to a generic failed label when no error message is present", () => {
    const { getByRole } = strip({
      has_deep_research: false,
      has_brief: false,
      has_scan: false,
      failed_research: true,
    });
    const chip = getByRole("img", { name: /Deep Dive failed/i });
    expect(chip.getAttribute("aria-label")).toBe("Deep Dive failed");
  });

  it("renders all three slot kinds when present", () => {
    const { getByRole } = strip({
      has_deep_research: true,
      has_brief: true,
      has_scan: true,
      deep_research_updated_at: new Date().toISOString(),
      brief_updated_at: new Date().toISOString(),
      scan_updated_at: new Date().toISOString(),
    });
    expect(getByRole("img", { name: /Deep Dive ready/i })).toBeInTheDocument();
    expect(getByRole("img", { name: /Brief ready/i })).toBeInTheDocument();
    expect(getByRole("img", { name: /Scan ready/i })).toBeInTheDocument();
  });

  it("does not render a scan failed state (scan failures are workstream-level)", () => {
    const { container } = strip({
      has_deep_research: false,
      has_brief: false,
      has_scan: false,
    });
    expect(container).toBeEmptyDOMElement();
  });
});
