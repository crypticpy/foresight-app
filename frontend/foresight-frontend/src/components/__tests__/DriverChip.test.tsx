/**
 * DriverChip tests — verify selection toggle, click handling, and label.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DriverChip } from "../DriverChip";

describe("DriverChip", () => {
  it("renders the driver name", () => {
    render(<DriverChip name="Cost of Living" disableTooltip />);
    expect(screen.getByText("Cost of Living")).toBeInTheDocument();
  });

  it("is unselected by default", () => {
    render(
      <DriverChip name="Cost of Living" onClick={() => {}} disableTooltip />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("reflects the selected state via aria-pressed", () => {
    render(
      <DriverChip
        name="Cost of Living"
        selected
        onClick={() => {}}
        disableTooltip
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("invokes onClick when activated", () => {
    const handler = vi.fn();
    render(
      <DriverChip name="Cost of Living" onClick={handler} disableTooltip />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("renders as disabled (read-only) when no onClick is provided", () => {
    render(<DriverChip name="Cost of Living" disableTooltip />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not expose aria-pressed when read-only", () => {
    render(<DriverChip name="Cost of Living" disableTooltip />);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("uses an accessible label including the driver name", () => {
    render(<DriverChip name="Cost of Living" disableTooltip />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Driver: Cost of Living",
    );
  });
});
