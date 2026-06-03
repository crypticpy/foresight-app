/**
 * Global app header composer — pulls together desktop nav, user menu,
 * mobile nav, and the local header state hook into a single fixed bar.
 *
 * @module components/Header
 */

import { Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { useAuthContext } from "../../hooks/useAuthContext";
import { useToast } from "../ui/Toast";

import { buildNavigation } from "./navConfig";
import { DesktopNav } from "./DesktopNav";
import { MobileNav } from "./MobileNav";
import { UserMenu } from "./UserMenu";
import { useHeaderState } from "./useHeaderState";

function buildBugReportHref(email: string | null | undefined): string {
  const subject = encodeURIComponent("Bug Report");
  const body = encodeURIComponent(
    `\n\n---\nPage: ${typeof window !== "undefined" ? window.location.href : ""}\nReporter: ${email ?? ""}\n`,
  );
  return `mailto:Christopher.Collins@austintexas.gov?subject=${subject}&body=${body}`;
}

const Header: React.FC = () => {
  const { user, profile, signOut } = useAuthContext();
  const { pushToast } = useToast();
  const location = useLocation();
  const {
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
  } = useHeaderState();

  const isGuest = profile?.account_type === "guest";
  const isAdmin = profile?.role === "admin" || profile?.role === "service_role";
  const navigation = buildNavigation({ isGuest, isAdmin });
  const bugReportHref = buildBugReportHref(user?.email);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to sign out", {
        variant: "error",
      });
    }
  };

  const closeMenu = () => setIsMenuOpen(false);
  const closeUserDropdown = () => setIsUserDropdownOpen(false);
  const closeMoreDropdown = () => setIsMoreDropdownOpen(false);
  const toggleUserDropdown = () => setIsUserDropdownOpen(!isUserDropdownOpen);
  const toggleMoreDropdown = () => setIsMoreDropdownOpen(!isMoreDropdownOpen);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  return (
    <header className="glass-header fixed w-full top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-3 hover:opacity-90 transition-opacity"
          >
            <img
              src="/logo-horizontal.png"
              alt="City of Austin"
              className="h-8 w-auto"
            />
            <div className="hidden sm:flex flex-col">
              <span className="text-sm font-semibold text-brand-blue leading-tight">
                Foresight
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                Strategic Research
              </span>
            </div>
          </Link>

          <DesktopNav
            navigation={navigation}
            currentPath={location.pathname}
            isMoreDropdownOpen={isMoreDropdownOpen}
            onToggleMore={toggleMoreDropdown}
            onCloseMore={closeMoreDropdown}
            moreDropdownRef={moreDropdownRef}
          />

          <UserMenu
            userEmail={user?.email}
            isGuest={isGuest}
            isDarkMode={isDarkMode}
            onToggleTheme={toggleTheme}
            isUserDropdownOpen={isUserDropdownOpen}
            onToggleUserDropdown={toggleUserDropdown}
            onCloseUserDropdown={closeUserDropdown}
            userDropdownRef={userDropdownRef}
            currentPath={location.pathname}
            bugReportHref={bugReportHref}
            onSignOut={handleSignOut}
          />

          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              aria-expanded={isMenuOpen}
              aria-label="Toggle navigation menu"
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md text-gray-600 hover:text-brand-blue hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-blue active:scale-95 transition-all duration-200"
            >
              {isMenuOpen ? (
                <X className="block h-6 w-6" />
              ) : (
                <Menu className="block h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      <MobileNav
        isMenuOpen={isMenuOpen}
        onCloseMenu={closeMenu}
        navigation={navigation}
        currentPath={location.pathname}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        userEmail={user?.email}
        bugReportHref={bugReportHref}
        onSignOut={handleSignOut}
      />
    </header>
  );
};

export default Header;
