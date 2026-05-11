/**
 * Owns the open/closed state for the CardActions dropdown plus the
 * "Move to..." submenu, and wires up the dismiss behaviors:
 *   - click outside the dropdown
 *   - Escape (also returns focus to the trigger)
 *   - ArrowUp / ArrowDown / Home / End between menu items
 *
 * Returns refs the parent must attach to the wrapper div, the trigger
 * button, and each menu item (`registerMenuItem(index)`), plus stable
 * toggle handlers.
 *
 * @module components/kanban/CardActions/useDropdownState
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

export interface UseDropdownStateResult {
  isOpen: boolean;
  showMoveSubmenu: boolean;
  dropdownRef: React.RefObject<HTMLDivElement>;
  buttonRef: React.RefObject<HTMLButtonElement>;
  registerMenuItem: (index: number) => (el: HTMLButtonElement | null) => void;
  toggleDropdown: (e: React.MouseEvent) => void;
  toggleMoveSubmenu: (e: React.MouseEvent) => void;
  closeDropdown: () => void;
  setShowMoveSubmenu: (next: boolean) => void;
}

export function useDropdownState(): UseDropdownStateResult {
  const [isOpen, setIsOpen] = useState(false);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const registerMenuItem = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      menuItemsRef.current[index] = el;
    },
    [],
  );

  // Click outside closes.
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowMoveSubmenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Keyboard nav.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          setIsOpen(false);
          setShowMoveSubmenu(false);
          setFocusedIndex(-1);
          buttonRef.current?.focus();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const menuItems = menuItemsRef.current.filter(Boolean);
            const next = prev < menuItems.length - 1 ? prev + 1 : 0;
            menuItems[next]?.focus();
            return next;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const menuItems = menuItemsRef.current.filter(Boolean);
            const next = prev > 0 ? prev - 1 : menuItems.length - 1;
            menuItems[next]?.focus();
            return next;
          });
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          menuItemsRef.current[0]?.focus();
          break;
        case "End": {
          e.preventDefault();
          const menuItems = menuItemsRef.current.filter(Boolean);
          setFocusedIndex(menuItems.length - 1);
          menuItems[menuItems.length - 1]?.focus();
          break;
        }
        default:
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const toggleDropdown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
    setShowMoveSubmenu(false);
    setFocusedIndex(-1);
    menuItemsRef.current = [];
  }, []);

  const toggleMoveSubmenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMoveSubmenu((prev) => !prev);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setShowMoveSubmenu(false);
  }, []);

  // The focused-index value is only used internally for the arrow-key
  // cursor; it does not need to leak to consumers. Reading it once keeps
  // the linter quiet without exposing an unused state setter.
  void focusedIndex;

  return {
    isOpen,
    showMoveSubmenu,
    dropdownRef,
    buttonRef,
    registerMenuItem,
    toggleDropdown,
    toggleMoveSubmenu,
    closeDropdown,
    setShowMoveSubmenu,
  };
}
