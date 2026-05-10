/**
 * Generic dropdown shell used by every filter in `AnalyticsFilters`.
 * Renders a click-to-open trigger plus a positioned popover and an
 * invisible full-screen backdrop that closes the popover on outside
 * clicks. Caller owns open/close state.
 *
 * @module components/analytics/AnalyticsFilters/Dropdown
 */

import React from "react";
import { cn } from "../../../lib/utils";

export interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  align?: "left" | "right";
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  isOpen,
  onOpenChange,
  align = "left",
  className,
}) => {
  return (
    <div className={cn("relative", className)}>
      <div onClick={() => onOpenChange(!isOpen)}>{trigger}</div>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              "absolute z-20 mt-2 w-64 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 max-h-80 overflow-y-auto",
              align === "left" ? "left-0" : "right-0",
            )}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
};
