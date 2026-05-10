/**
 * Privacy & Security card. Currently a static UI scaffold — the toggles are
 * not wired to any persistence yet; keeping the existing visual layout so
 * we don't ship a regression alongside the refactor.
 *
 * @module pages/Settings/PrivacyCard
 */

import { Shield } from "lucide-react";
import { SettingsCard } from "./SettingsCard";

export function PrivacyCard() {
  return (
    <SettingsCard icon={Shield} title="Privacy & Security">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              Profile Visibility
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Allow other users to see your profile information.
            </p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 dark:border-gray-600 rounded"
            defaultChecked
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              Share Workstreams
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Allow colleagues to view and collaborate on your workstreams.
            </p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 dark:border-gray-600 rounded"
          />
        </div>
      </div>
    </SettingsCard>
  );
}
