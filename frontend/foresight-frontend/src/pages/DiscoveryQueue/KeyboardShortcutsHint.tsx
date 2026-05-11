/**
 * Desktop-only hint strip showing the j/k/f/d/z shortcuts. Hidden on mobile
 * and while the bulk-actions bar is open.
 *
 * @module pages/DiscoveryQueue/KeyboardShortcutsHint
 */

import React from "react";

export function KeyboardShortcutsHint() {
  return (
    <div className="mb-4 px-4 py-2 bg-gray-50 dark:bg-dark-surface/50 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-center gap-6 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <Kbd>j</Kbd>
          <Kbd>k</Kbd>
          <span>Navigate</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>f</Kbd>
          <span>Follow</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>d</Kbd>
          <span>Dismiss</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>z</Kbd>
          <span>Undo</span>
        </span>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono text-gray-700 dark:text-gray-300">
      {children}
    </kbd>
  );
}
