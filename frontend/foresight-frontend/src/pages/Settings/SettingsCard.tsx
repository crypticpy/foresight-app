/**
 * Shared chrome for a Settings card: header bar with optional icon + title,
 * then a padded body slot.
 *
 * @module pages/Settings/SettingsCard
 */

import type { ReactNode, ElementType } from "react";

interface SettingsCardProps {
  icon?: ElementType;
  title: string;
  children: ReactNode;
}

export function SettingsCard({
  icon: Icon,
  title,
  children,
}: SettingsCardProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          {Icon && <Icon className="h-5 w-5 text-gray-400 mr-2" />}
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            {title}
          </h2>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
