/**
 * Renders a list of navigation links with variant-specific styling:
 *
 * - `dropdown` — compact rows used inside the desktop "More" / Admin
 *   dropdowns.
 * - `mobile` — larger touch targets used in the slide-out mobile menu.
 *
 * @module components/Header/NavLinkItem
 */

import { Link } from "react-router-dom";

import type { NavItem } from "./navConfig";

export interface NavLinkItemProps {
  items: NavItem[];
  variant: "dropdown" | "mobile";
  onNavigate: () => void;
  currentPath: string;
}

export function NavLinkItem({
  items,
  variant,
  onNavigate,
  currentPath,
}: NavLinkItemProps) {
  const isDropdown = variant === "dropdown";

  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentPath === item.href;
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center text-sm transition-colors ${
              isDropdown
                ? `px-4 py-2 ${
                    isActive
                      ? "text-brand-blue bg-brand-blue/10"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`
                : `min-h-[44px] px-3 py-2 text-base font-medium rounded-md active:scale-[0.98] transition-all duration-200 ${
                    isActive
                      ? "text-brand-blue bg-brand-blue/10"
                      : "text-gray-600 hover:text-brand-dark-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                  }`
            }`}
          >
            <Icon
              className={
                isDropdown ? "w-4 h-4 mr-3" : "w-5 h-5 mr-3 flex-shrink-0"
              }
            />
            {isDropdown ? (
              item.name
            ) : (
              <span className="flex-grow">{item.name}</span>
            )}
          </Link>
        );
      })}
    </>
  );
}
