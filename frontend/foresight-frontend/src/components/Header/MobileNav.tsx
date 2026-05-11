/**
 * Slide-out mobile navigation: main links, More items, Guides, Admin,
 * Settings, theme toggle, signed-in row, bug-report mailto, and Sign Out.
 *
 * @module components/Header/MobileNav
 */

import { Bug, LogOut, Moon, Settings, Sun, User } from "lucide-react";
import { Link } from "react-router-dom";

import { isNavItemActive, type NavigationLists } from "./navConfig";
import { NavLinkItem } from "./NavLinkItem";

export interface MobileNavProps {
  isMenuOpen: boolean;
  onCloseMenu: () => void;
  navigation: NavigationLists;
  currentPath: string;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  userEmail: string | null | undefined;
  bugReportHref: string;
  onSignOut: () => void;
}

export function MobileNav({
  isMenuOpen,
  onCloseMenu,
  navigation,
  currentPath,
  isDarkMode,
  onToggleTheme,
  userEmail,
  bugReportHref,
  onSignOut,
}: MobileNavProps) {
  if (!isMenuOpen) return null;

  return (
    <div className="md:hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white/95 dark:bg-brand-dark-blue/95 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-700/50">
        {navigation.main.map((item) => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item.href, currentPath);
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={onCloseMenu}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center min-h-[44px] px-3 py-2 text-base font-medium rounded-md active:scale-[0.98] transition-all duration-200 ${
                isActive
                  ? "text-brand-blue bg-brand-blue/10"
                  : "text-gray-600 hover:text-brand-dark-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              }`}
            >
              <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
              <span className="flex-grow">{item.name}</span>
            </Link>
          );
        })}

        <NavLinkItem
          items={navigation.more}
          variant="mobile"
          onNavigate={onCloseMenu}
          currentPath={currentPath}
        />

        <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2 mt-2">
          <div className="px-3 py-1">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Guides
            </span>
          </div>
          <NavLinkItem
            items={navigation.guides}
            variant="mobile"
            onNavigate={onCloseMenu}
            currentPath={currentPath}
          />
          {navigation.admin.length > 0 && (
            <NavLinkItem
              items={navigation.admin}
              variant="mobile"
              onNavigate={onCloseMenu}
              currentPath={currentPath}
            />
          )}
        </div>

        <Link
          to="/settings"
          onClick={onCloseMenu}
          aria-current={currentPath === "/settings" ? "page" : undefined}
          className={`flex items-center min-h-[44px] px-3 py-2 text-base font-medium rounded-md active:scale-[0.98] transition-all duration-200 ${
            currentPath === "/settings"
              ? "text-brand-blue bg-brand-blue/10"
              : "text-gray-600 hover:text-brand-dark-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
          }`}
        >
          <Settings className="w-5 h-5 mr-3 flex-shrink-0" />
          <span className="flex-grow">Settings</span>
        </Link>

        <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-4 mt-4">
          <button
            onClick={onToggleTheme}
            className="w-full flex items-center min-h-[44px] px-3 py-2 text-base font-medium text-gray-600 hover:text-brand-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md active:scale-[0.98] transition-all duration-200"
          >
            {isDarkMode ? (
              <>
                <Sun className="w-5 h-5 mr-3 flex-shrink-0" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-5 h-5 mr-3 flex-shrink-0" />
                <span>Dark Mode</span>
              </>
            )}
          </button>

          <div className="px-3 py-2 min-h-[44px] flex items-center text-sm text-gray-600 dark:text-gray-300">
            <User className="w-5 h-5 mr-3 flex-shrink-0" />
            <span className="font-medium truncate">{userEmail}</span>
          </div>
          <a
            href={bugReportHref}
            onClick={onCloseMenu}
            className="w-full flex items-center min-h-[44px] px-3 py-2 text-base font-medium text-gray-600 hover:text-brand-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md active:scale-[0.98] transition-all duration-200"
          >
            <Bug className="w-5 h-5 mr-3 flex-shrink-0" />
            <span>Report a Bug</span>
          </a>
          <button
            onClick={onSignOut}
            className="w-full flex items-center min-h-[44px] px-3 py-2 text-base font-medium text-gray-600 hover:text-brand-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md active:scale-[0.98] transition-all duration-200"
          >
            <LogOut className="w-5 h-5 mr-3 flex-shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
