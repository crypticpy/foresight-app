/**
 * CommandPalette — ⌘K-style action launcher.
 *
 * Renders a centered modal with a search input and a filtered list of
 * `CommandAction` items. Keyboard model:
 *
 *   ↑/↓        — move selection
 *   Enter      — activate the highlighted action and close
 *   Esc        — close
 *   click ✕    — close
 *   click ⊠    — close (backdrop)
 *
 * The host page is responsible for the open-trigger keybinding (⌘K / Ctrl+K)
 * and for passing in the action list. Keeping it controlled keeps the palette
 * decoupled from any specific feature wiring.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

export interface CommandAction {
  /** Stable key for React reconciliation; also used in tests. */
  id: string;
  /** Primary label, e.g. "Go to Discover". */
  name: string;
  /** Optional secondary line, e.g. "Browse the signal feed". */
  description?: string;
  /** Extra search terms not shown in the UI but counted by the matcher. */
  keywords?: string[];
  /** Optional left-side icon. */
  icon?: LucideIcon;
  /** Called when the user activates the action. */
  onActivate: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
}

/**
 * Case-insensitive substring match against name + description + keywords.
 * No fuzzy/typo matching — keep it predictable.
 */
function matchesQuery(action: CommandAction, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (action.name.toLowerCase().includes(q)) return true;
  if (action.description?.toLowerCase().includes(q)) return true;
  return action.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false;
}

export function CommandPalette({
  open,
  onClose,
  actions,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Mirror of `selectedIndex` so the Enter handler can read the latest value
  // even when the prior ArrowDown's setState hasn't flushed yet (rapid input).
  const selectedIndexRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(
    () => actions.filter((a) => matchesQuery(a, query)),
    [actions, query],
  );

  // Reset state and focus the input each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    // Defer to after the modal's enter animation so the input actually gets focus.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Clamp the selection into range whenever the filtered list changes.
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  // Keep the ref in sync so synchronous keyboard handlers see the latest index.
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Scroll the highlighted row into view when the user arrows past the viewport edge.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(
      `[data-index="${selectedIndex}"]`,
    );
    // JSDOM (and some old browsers) don't implement scrollIntoView; guard.
    if (typeof el?.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  const activate = (index: number) => {
    const action = filtered[index];
    if (!action) return;
    action.onActivate();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(selectedIndexRef.current + 1, filtered.length - 1);
      selectedIndexRef.current = next;
      setSelectedIndex(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(selectedIndexRef.current - 1, 0);
      selectedIndexRef.current = next;
      setSelectedIndex(next);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      activate(selectedIndexRef.current);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onKeyDown={onKeyDown}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white dark:bg-dark-surface-elevated rounded-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
        {/* Search row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-dark-surface-hover">
          <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search…"
            aria-label="Command query"
            className="flex-1 bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Result list */}
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
            No commands match "{query}".
          </div>
        ) : (
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Available commands"
            className="max-h-80 overflow-y-auto py-1"
          >
            {filtered.map((action, index) => {
              const Icon = action.icon;
              const isSelected = index === selectedIndex;
              return (
                <li
                  key={action.id}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                >
                  <button
                    type="button"
                    onClick={() => activate(index)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      isSelected
                        ? "bg-brand-blue/10 dark:bg-brand-blue/20"
                        : "hover:bg-gray-50 dark:hover:bg-dark-surface-hover",
                    )}
                  >
                    {Icon ? (
                      <Icon
                        className={cn(
                          "h-4 w-4 flex-shrink-0",
                          isSelected
                            ? "text-brand-blue"
                            : "text-gray-400 dark:text-gray-500",
                        )}
                      />
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {action.name}
                      </div>
                      {action.description ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {action.description}
                        </div>
                      ) : null}
                    </div>
                    <ArrowRight
                      className={cn(
                        "h-4 w-4 flex-shrink-0 transition-opacity",
                        isSelected
                          ? "opacity-100 text-brand-blue"
                          : "opacity-0",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-dark-surface-hover text-[11px] text-gray-500 dark:text-gray-400">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-dark-surface-hover">
              ↑
            </kbd>{" "}
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-dark-surface-hover">
              ↓
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-dark-surface-hover">
              Enter
            </kbd>{" "}
            select
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-dark-surface-hover">
              Esc
            </kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
