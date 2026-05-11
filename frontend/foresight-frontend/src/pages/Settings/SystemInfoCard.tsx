/**
 * System Information card — build date (injected by Vite as `__BUILD_DATE__`)
 * and support contact email.
 *
 * @module pages/Settings/SystemInfoCard
 */

import { Database } from "lucide-react";
import { SettingsCard } from "./SettingsCard";

export function SystemInfoCard() {
  return (
    <SettingsCard icon={Database} title="System Information">
      <div className="space-y-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Build:</span>
          <span className="text-gray-900 dark:text-white">
            Foresight pilot · {__BUILD_DATE__}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Support:</span>
          <a
            href="mailto:contact-foresight@austintexas.gov"
            className="text-brand-blue hover:underline dark:text-blue-300"
          >
            contact-foresight@austintexas.gov
          </a>
        </div>
      </div>
    </SettingsCard>
  );
}
