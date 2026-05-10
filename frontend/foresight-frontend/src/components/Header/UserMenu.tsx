/**
 * Right-side desktop chrome: guest badge, bug-report mailto, bell, and
 * the user-account dropdown (theme toggle, Settings, Sign Out).
 *
 * @module components/Header/UserMenu
 */

import {
  Bell,
  Bug,
  ChevronDown,
  LogOut,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { Link } from "react-router-dom";

export interface UserMenuProps {
  userEmail: string | null | undefined;
  isGuest: boolean;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isUserDropdownOpen: boolean;
  onToggleUserDropdown: () => void;
  onCloseUserDropdown: () => void;
  userDropdownRef: React.RefObject<HTMLDivElement>;
  currentPath: string;
  bugReportHref: string;
  onSignOut: () => void;
}

export function UserMenu({
  userEmail,
  isGuest,
  isDarkMode,
  onToggleTheme,
  isUserDropdownOpen,
  onToggleUserDropdown,
  onCloseUserDropdown,
  userDropdownRef,
  currentPath,
  bugReportHref,
  onSignOut,
}: UserMenuProps) {
  return (
    <div className="hidden md:flex items-center gap-1" ref={userDropdownRef}>
      {isGuest && (
        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
          Guest
        </span>
      )}
      <a
        href={bugReportHref}
        aria-label="Report a bug"
        title="Report a bug"
        className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-brand-dark-blue dark:text-gray-300 dark:hover:bg-white/10"
      >
        <Bug className="h-4 w-4" />
      </a>
      <Link
        to="/notifications"
        aria-label="Notifications"
        className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-brand-dark-blue dark:text-gray-300 dark:hover:bg-white/10"
      >
        <Bell className="h-4 w-4" />
      </Link>
      <div className="relative">
        <button
          onClick={onToggleUserDropdown}
          aria-haspopup="menu"
          aria-expanded={isUserDropdownOpen}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-brand-dark-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md transition-colors duration-200"
        >
          <User className="w-4 h-4 mr-2" />
          <span className="max-w-[150px] truncate">
            {userEmail?.split("@")[0]}
          </span>
          <ChevronDown
            className={`w-3 h-3 ml-1 transition-transform ${isUserDropdownOpen ? "rotate-180" : ""}`}
          />
        </button>
        {isUserDropdownOpen && (
          <div
            className="absolute right-0 mt-1 w-56 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 animate-in fade-in-0 zoom-in-95 duration-200"
            role="menu"
          >
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Signed in as
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {userEmail}
              </p>
            </div>

            <button
              onClick={onToggleTheme}
              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-4 h-4 mr-3" />
                  Light Mode
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 mr-3" />
                  Dark Mode
                </>
              )}
            </button>

            <Link
              to="/settings"
              onClick={onCloseUserDropdown}
              className={`flex items-center px-4 py-2 text-sm transition-colors ${
                currentPath === "/settings"
                  ? "text-brand-blue bg-brand-blue/10"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <Settings className="w-4 h-4 mr-3" />
              Settings
            </Link>

            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

            <button
              onClick={() => {
                onCloseUserDropdown();
                onSignOut();
              }}
              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
