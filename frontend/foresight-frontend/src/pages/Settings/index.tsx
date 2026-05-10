/**
 * Composer for the Settings page. Each card owns its own state and API
 * round-trips; the composer is just chrome.
 *
 * @module pages/Settings
 */

import { ProfileCard } from "./ProfileCard";
import { NotificationCard } from "./NotificationCard";
import { PrivacyCard } from "./PrivacyCard";
import { SystemInfoCard } from "./SystemInfoCard";
import { AccountActionsCard } from "./AccountActionsCard";

export default function Settings() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-brand-dark-blue dark:text-white">
          Settings
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage your account preferences and Foresight configuration.
        </p>
      </div>

      <div className="space-y-6">
        <ProfileCard />
        <NotificationCard />
        <PrivacyCard />
        <SystemInfoCard />
        <AccountActionsCard />
      </div>
    </div>
  );
}
