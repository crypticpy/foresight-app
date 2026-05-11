/**
 * Header local state — dark-mode toggle, dropdown open/close, the
 * click-outside + Escape + Cmd-K listeners that wire those interactions
 * into the global header.
 *
 * @module components/Header/useHeaderState
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface UseHeaderStateReturn {
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  isUserDropdownOpen: boolean;
  setIsUserDropdownOpen: (open: boolean) => void;
  isMoreDropdownOpen: boolean;
  setIsMoreDropdownOpen: (open: boolean) => void;
  userDropdownRef: React.RefObject<HTMLDivElement>;
  moreDropdownRef: React.RefObject<HTMLDivElement>;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export function useHeaderState(): UseHeaderStateReturn {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isMoreDropdownOpen, setIsMoreDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userDropdownRef.current &&
        !userDropdownRef.current.contains(event.target as Node)
      ) {
        setIsUserDropdownOpen(false);
      }
      if (
        moreDropdownRef.current &&
        !moreDropdownRef.current.contains(event.target as Node)
      ) {
        setIsMoreDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsUserDropdownOpen(false);
        setIsMoreDropdownOpen(false);
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleCmdK = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) return;
      // Don't hijack the shortcut while the user is typing — Cmd+K is the
      // chrome "open Ask Foresight" shortcut, but inside an input/textarea
      // or contenteditable element the keystroke belongs to the field.
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      navigate("/ask");
    };
    document.addEventListener("keydown", handleCmdK);
    return () => document.removeEventListener("keydown", handleCmdK);
  }, [navigate]);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  return {
    isMenuOpen,
    setIsMenuOpen,
    isUserDropdownOpen,
    setIsUserDropdownOpen,
    isMoreDropdownOpen,
    setIsMoreDropdownOpen,
    userDropdownRef,
    moreDropdownRef,
    isDarkMode,
    toggleTheme,
  };
}
