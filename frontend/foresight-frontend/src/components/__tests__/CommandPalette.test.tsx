/**
 * CommandPalette tests — render gating, query filtering, keyboard
 * navigation (arrow + enter), and close behaviors (Esc, backdrop, ✕).
 */

import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette, type CommandAction } from "../CommandPalette";

function makeActions(): {
  actions: CommandAction[];
  spies: Record<string, ReturnType<typeof vi.fn>>;
} {
  const spies = {
    discover: vi.fn(),
    workstreams: vi.fn(),
    refresh: vi.fn(),
  };
  const actions: CommandAction[] = [
    {
      id: "discover",
      name: "Go to Discover",
      description: "Browse the signal feed",
      onActivate: spies.discover,
    },
    {
      id: "workstreams",
      name: "Go to Workstreams",
      description: "Open your research streams",
      onActivate: spies.workstreams,
    },
    {
      id: "refresh",
      name: "Refresh dashboard",
      keywords: ["reload"],
      onActivate: spies.refresh,
    },
  ];
  return { actions, spies };
}

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const { actions } = makeActions();
    render(
      <CommandPalette open={false} onClose={() => {}} actions={actions} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders all actions when open and the query is empty", () => {
    const { actions } = makeActions();
    render(<CommandPalette open onClose={() => {}} actions={actions} />);
    expect(screen.getByText("Go to Discover")).toBeInTheDocument();
    expect(screen.getByText("Go to Workstreams")).toBeInTheDocument();
    expect(screen.getByText("Refresh dashboard")).toBeInTheDocument();
  });

  it("filters by name substring (case-insensitive)", () => {
    const { actions } = makeActions();
    render(<CommandPalette open onClose={() => {}} actions={actions} />);
    fireEvent.change(screen.getByLabelText("Command query"), {
      target: { value: "WORKSTREAM" },
    });
    expect(screen.getByText("Go to Workstreams")).toBeInTheDocument();
    expect(screen.queryByText("Go to Discover")).not.toBeInTheDocument();
  });

  it("matches against keywords too", () => {
    const { actions } = makeActions();
    render(<CommandPalette open onClose={() => {}} actions={actions} />);
    fireEvent.change(screen.getByLabelText("Command query"), {
      target: { value: "reload" },
    });
    expect(screen.getByText("Refresh dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Go to Discover")).not.toBeInTheDocument();
  });

  it("shows a no-match message when nothing matches", () => {
    const { actions } = makeActions();
    render(<CommandPalette open onClose={() => {}} actions={actions} />);
    fireEvent.change(screen.getByLabelText("Command query"), {
      target: { value: "zzz-no-such-thing" },
    });
    expect(
      screen.getByText(/No commands match "zzz-no-such-thing"/i),
    ).toBeInTheDocument();
  });

  it("activates the first action on Enter and closes the palette", () => {
    const { actions, spies } = makeActions();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions} />);
    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    });
    expect(spies.discover).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ArrowDown moves the selection so Enter activates the second action", () => {
    const { actions, spies } = makeActions();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions} />);
    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowDown" });
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    });
    expect(spies.workstreams).toHaveBeenCalledTimes(1);
    expect(spies.discover).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ArrowUp at index 0 stays at 0", () => {
    const { actions, spies } = makeActions();
    render(<CommandPalette open onClose={() => {}} actions={actions} />);
    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowUp" });
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    });
    expect(spies.discover).toHaveBeenCalledTimes(1);
  });

  it("Esc calls onClose without activating anything", () => {
    const { actions, spies } = makeActions();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions} />);
    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(spies.discover).not.toHaveBeenCalled();
  });

  it("clicking the backdrop closes the palette", () => {
    const { actions } = makeActions();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions} />);
    fireEvent.click(screen.getByLabelText("Close command palette"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking an item activates it and closes the palette", () => {
    const { actions, spies } = makeActions();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} actions={actions} />);
    fireEvent.click(screen.getByText("Go to Workstreams"));
    expect(spies.workstreams).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
