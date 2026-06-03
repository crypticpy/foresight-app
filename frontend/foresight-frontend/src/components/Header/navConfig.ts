/**
 * Navigation item shape + the static link lists used by both the desktop
 * header and the mobile slide-out menu. Lists that depend on the active
 * profile (Feeds, Admin) are derived in `buildNavigation`.
 *
 * @module components/Header/navConfig
 */

import {
  BarChart3,
  BookOpen,
  Briefcase,
  Compass,
  FolderOpen,
  Heart,
  HelpCircle,
  Home,
  type LucideIcon,
  Radio,
  Rss,
  Shield,
  Sparkles,
  Wand2,
} from "lucide-react";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

export const MAIN_NAVIGATION: NavItem[] = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "For You", href: "/for-you", icon: Heart },
  { name: "Ask", href: "/ask", icon: Sparkles },
  { name: "Discover", href: "/discover", icon: Compass },
  { name: "Signals", href: "/signals", icon: Radio },
  { name: "Workstreams", href: "/workstreams", icon: FolderOpen },
  { name: "Help", href: "/guide", icon: HelpCircle },
];

export const GUIDE_NAVIGATION: NavItem[] = [
  { name: "Ask Foresight Guide", href: "/guide/chat", icon: HelpCircle },
  { name: "Signals Guide", href: "/guide/signals", icon: HelpCircle },
  { name: "Discover Guide", href: "/guide/discover", icon: HelpCircle },
  { name: "Workstreams Guide", href: "/guide/workstreams", icon: HelpCircle },
];

export interface BuildNavigationOptions {
  isGuest: boolean;
  isAdmin: boolean;
}

export interface NavigationLists {
  main: NavItem[];
  more: NavItem[];
  guides: NavItem[];
  admin: NavItem[];
}

export function buildNavigation({
  isGuest,
  isAdmin,
}: BuildNavigationOptions): NavigationLists {
  const more: NavItem[] = [
    { name: "Portfolios", href: "/portfolios", icon: Briefcase },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    ...(isGuest ? [] : [{ name: "Feeds", href: "/feeds", icon: Rss }]),
    { name: "How It Works", href: "/how-it-works", icon: Wand2 },
    { name: "Methodology", href: "/methodology", icon: BookOpen },
  ];

  return {
    main: MAIN_NAVIGATION,
    more,
    guides: GUIDE_NAVIGATION,
    admin: isAdmin ? [{ name: "Admin", href: "/admin", icon: Shield }] : [],
  };
}

/** Returns true when the active route prefix should mark the link active. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  if (href === "/discover" && pathname.startsWith("/discover")) return true;
  if (href === "/signals" && pathname.startsWith("/signals")) return true;
  if (href === "/workstreams" && pathname.startsWith("/workstreams")) {
    return true;
  }
  return false;
}
