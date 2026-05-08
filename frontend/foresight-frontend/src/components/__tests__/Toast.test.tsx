/**
 * Toast tests — provider exposes pushToast/dismissToast, auto-dismiss timer
 * fires, and sticky toasts (duration: 0) stay until dismissed manually.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "../ui/Toast";

function Harness({
  message,
  duration,
  variant,
}: {
  message: string;
  duration?: number;
  variant?: "success" | "error" | "info";
}) {
  const { pushToast } = useToast();
  return (
    <button onClick={() => pushToast(message, { duration, variant })}>
      push
    </button>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws when useToast is called outside the provider", () => {
    const FailingComponent = () => {
      useToast();
      return null;
    };
    // Suppress React's expected error log for this assertion.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<FailingComponent />)).toThrow(
      /must be used inside a <ToastProvider>/,
    );
    errSpy.mockRestore();
  });

  it("renders a toast when pushToast is called", () => {
    render(
      <ToastProvider>
        <Harness message="Saved successfully" variant="success" />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("push"));
    });
    expect(screen.getByText("Saved successfully")).toBeInTheDocument();
  });

  it("auto-dismisses after the supplied duration", () => {
    render(
      <ToastProvider>
        <Harness message="auto goes away" duration={2000} />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("push"));
    });
    expect(screen.getByText("auto goes away")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText("auto goes away")).not.toBeInTheDocument();
  });

  it("keeps a sticky toast (duration: 0) on screen indefinitely", () => {
    render(
      <ToastProvider>
        <Harness message="sticky" duration={0} />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("push"));
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("sticky")).toBeInTheDocument();
  });

  it("dismisses a toast when its X button is clicked", () => {
    render(
      <ToastProvider>
        <Harness message="click to close" duration={0} />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("push"));
    });
    expect(screen.getByText("click to close")).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByLabelText("Dismiss notification"));
    });
    expect(screen.queryByText("click to close")).not.toBeInTheDocument();
  });

  it("renders the success-variant icon when variant is 'success'", () => {
    render(
      <ToastProvider>
        <Harness message="ok" variant="success" duration={0} />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("push"));
    });
    // Variant ring is the simplest stable assertion — emerald for success.
    const status = screen.getByRole("status");
    expect(status.className).toMatch(/ring-emerald-500/);
  });
});
