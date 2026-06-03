/**
 * Desktop navigation row: top-level links + the "More" dropdown that
 * collapses Portfolios / Analytics / Feeds / Methodology / Guides /
 * Admin into a single menu.
 *
 * @module components/Header/DesktopNav
 */

import { ChevronDown, MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";

import { isNavItemActive, type NavigationLists } from "./navConfig";
import { NavLinkItem } from "./NavLinkItem";

export interface DesktopNavProps {
  navigation: NavigationLists;
  currentPath: string;
  isMoreDropdownOpen: boolean;
  onToggleMore: () => void;
  onCloseMore: () => void;
  moreDropdownRef: React.RefObject<HTMLDivElement>;
}

export function DesktopNav({
  navigation,
  currentPath,
  isMoreDropdownOpen,
  onToggleMore,
  onCloseMore,
  moreDropdownRef,
}: DesktopNavProps) {
  const aggregatedMoreItems = [
    ...navigation.more,
    ...navigation.guides,
    ...navigation.admin,
  ];
  const moreIsActive = aggregatedMoreItems.some(
    (item) => currentPath === item.href,
  );

  return (
    <nav className="hidden md:flex items-center space-x-1">
      {navigation.main.map((item) => {
        const Icon = item.icon;
        const isActive = isNavItemActive(item.href, currentPath);
        return (
          <Link
            key={item.name}
            to={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center px-2.5 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
              isActive
                ? "text-brand-blue bg-brand-blue/10"
                : "text-gray-600 hover:text-brand-dark-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
            }`}
          >
            <Icon className="w-4 h-4 mr-2" />
            {item.name}
          </Link>
        );
      })}

      <div className="relative" ref={moreDropdownRef}>
        <button
          onClick={onToggleMore}
          aria-haspopup="menu"
          aria-expanded={isMoreDropdownOpen}
          className={`inline-flex items-center px-2.5 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
            moreIsActive
              ? "text-brand-blue bg-brand-blue/10"
              : "text-gray-600 hover:text-brand-dark-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
          }`}
        >
          <MoreHorizontal className="w-4 h-4 mr-2" />
          More
          <ChevronDown
            className={`w-3 h-3 ml-1 transition-transform ${isMoreDropdownOpen ? "rotate-180" : ""}`}
          />
        </button>
        {isMoreDropdownOpen && (
          <div
            className="absolute right-0 mt-1 w-48 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 animate-in fade-in-0 zoom-in-95 duration-200"
            role="menu"
          >
            <NavLinkItem
              items={navigation.more}
              variant="dropdown"
              onNavigate={onCloseMore}
              currentPath={currentPath}
            />
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <div className="px-4 py-1">
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Guides
              </span>
            </div>
            <NavLinkItem
              items={navigation.guides}
              variant="dropdown"
              onNavigate={onCloseMore}
              currentPath={currentPath}
            />
            {navigation.admin.length > 0 && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <NavLinkItem
                  items={navigation.admin}
                  variant="dropdown"
                  onNavigate={onCloseMore}
                  currentPath={currentPath}
                />
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
