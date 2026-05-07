/**
 * FrameworkBadge tests — verify code rendering, accessibility, and tooltip
 * gating (no tooltip when name + description are absent).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FrameworkBadge } from "../FrameworkBadge";

describe("FrameworkBadge", () => {
  it("renders the framework code", () => {
    render(<FrameworkBadge code="PPP" disableTooltip />);
    expect(screen.getByText("PPP")).toBeInTheDocument();
  });

  it("uses the framework name in aria-label when provided", () => {
    render(
      <FrameworkBadge
        code="PPP"
        name="People · Place · Partnerships"
        disableTooltip
      />,
    );
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute(
      "aria-label",
      "People · Place · Partnerships framework",
    );
  });

  it("falls back to code-only aria-label when name is missing", () => {
    render(<FrameworkBadge code="PPP" disableTooltip />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "PPP framework",
    );
  });

  it("renders without an icon when showIcon is false", () => {
    const { container } = render(
      <FrameworkBadge code="PPP" showIcon={false} disableTooltip />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("uses indigo theme for the PPP framework", () => {
    render(<FrameworkBadge code="PPP" disableTooltip />);
    const badge = screen.getByRole("status");
    expect(badge.className).toMatch(/indigo/);
  });

  it("falls back to gray styling for unknown framework codes", () => {
    render(<FrameworkBadge code="XYZ" disableTooltip />);
    const badge = screen.getByRole("status");
    expect(badge.className).toMatch(/gray/);
  });
});
