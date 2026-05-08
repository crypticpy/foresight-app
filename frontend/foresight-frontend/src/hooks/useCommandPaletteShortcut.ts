/**
 * useCommandPaletteShortcut — global ⌘K / Ctrl+K listener.
 *
 * Allows ⌘K to fire even when an input is focused — that's the canonical
 * behavior in VS Code / Linear / Raycast and what users expect.
 */

import { useEffect } from "react";

export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isModK) return;
      e.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
