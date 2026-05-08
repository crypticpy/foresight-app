/**
 * useCommandPaletteShortcut tests — fires `onOpen` for ⌘K / Ctrl+K and
 * ignores unrelated keystrokes. Cleans up its listener on unmount.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCommandPaletteShortcut } from "../useCommandPaletteShortcut";

function dispatch(key: string, modifier: "meta" | "ctrl" | "none" = "none") {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: modifier === "meta",
    ctrlKey: modifier === "ctrl",
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

describe("useCommandPaletteShortcut", () => {
  it("fires onOpen for Cmd+K", () => {
    const onOpen = vi.fn();
    renderHook(() => useCommandPaletteShortcut(onOpen));
    dispatch("k", "meta");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires onOpen for Ctrl+K", () => {
    const onOpen = vi.fn();
    renderHook(() => useCommandPaletteShortcut(onOpen));
    dispatch("k", "ctrl");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("matches uppercase K too", () => {
    const onOpen = vi.fn();
    renderHook(() => useCommandPaletteShortcut(onOpen));
    dispatch("K", "meta");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores K without a modifier", () => {
    const onOpen = vi.fn();
    renderHook(() => useCommandPaletteShortcut(onOpen));
    dispatch("k", "none");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ignores unrelated keys with the modifier", () => {
    const onOpen = vi.fn();
    renderHook(() => useCommandPaletteShortcut(onOpen));
    dispatch("j", "meta");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("calls preventDefault on the matched event", () => {
    renderHook(() => useCommandPaletteShortcut(vi.fn()));
    const ev = dispatch("k", "meta");
    expect(ev.defaultPrevented).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const onOpen = vi.fn();
    const { unmount } = renderHook(() => useCommandPaletteShortcut(onOpen));
    unmount();
    dispatch("k", "meta");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
