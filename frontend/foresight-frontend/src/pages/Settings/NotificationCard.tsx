/**
 * Notification preferences card. Owns the notif state and the load/save
 * round-trips against /api/v1/me/notification-preferences. The "use account
 * email" toggle is derived UI state, not a persisted field.
 *
 * @module pages/Settings/NotificationCard
 */

import { useEffect, useState } from "react";
import { Bell, Mail } from "lucide-react";
import { getAuthToken } from "../../lib/auth";
import { useAuthContext } from "../../hooks/useAuthContext";
import { LoadingButton } from "../../components/ui/LoadingButton";
import { API_BASE_URL } from "../../lib/config";
import { SettingsCard } from "./SettingsCard";

type DigestFrequency = "daily" | "weekly" | "none";

interface NotifPrefs {
  notification_email: string;
  digest_frequency: DigestFrequency;
  digest_day: string;
  include_new_signals: boolean;
  include_velocity_changes: boolean;
  include_pattern_insights: boolean;
  include_workstream_updates: boolean;
}

const DIGEST_FREQUENCIES: { value: DigestFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "none", label: "None" },
];

const DIGEST_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const CONTENT_TOGGLES: { key: keyof NotifPrefs; label: string }[] = [
  { key: "include_new_signals", label: "New signals in my workstreams" },
  {
    key: "include_velocity_changes",
    label: "Velocity changes on followed signals",
  },
  { key: "include_pattern_insights", label: "Cross-signal pattern alerts" },
  { key: "include_workstream_updates", label: "Workstream scan results" },
];

export function NotificationCard() {
  const { user } = useAuthContext();
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    notification_email: "",
    digest_frequency: "weekly",
    digest_day: "monday",
    include_new_signals: true,
    include_velocity_changes: true,
    include_pattern_insights: true,
    include_workstream_updates: true,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [useAccountEmail, setUseAccountEmail] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const response = await fetch(
          `${API_BASE_URL}/api/v1/me/notification-preferences`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (response.ok) {
          const data = await response.json();
          setNotifPrefs((prev) => ({ ...prev, ...data }));
          setUseAccountEmail(
            !data.notification_email || data.notification_email === user?.email,
          );
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? `Could not load preferences: ${error.message}`
            : "Could not load notification preferences.",
        );
      }
    };
    load();
  }, [user?.email]);

  const savePreferences = async () => {
    setLoading(true);
    setMessage("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const payload = {
        ...notifPrefs,
        notification_email: useAccountEmail
          ? user?.email || ""
          : notifPrefs.notification_email,
      };
      const response = await fetch(
        `${API_BASE_URL}/api/v1/me/notification-preferences`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error("Failed to save");
      setMessage("Notification preferences saved!");
    } catch (_error) {
      setMessage("Error saving preferences. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsCard icon={Bell} title="Notification Preferences">
      <div className="space-y-6">
        {/* Notification Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Mail className="inline h-4 w-4 mr-1.5 -mt-0.5" />
            Notification Email
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={useAccountEmail}
                onChange={(e) => setUseAccountEmail(e.target.checked)}
                className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 dark:border-gray-600 rounded"
              />
              Use account email ({user?.email})
            </label>
            {!useAccountEmail && (
              <input
                type="email"
                value={notifPrefs.notification_email}
                onChange={(e) =>
                  setNotifPrefs({
                    ...notifPrefs,
                    notification_email: e.target.value,
                  })
                }
                placeholder="Custom notification email"
                className="mt-1 block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
              />
            )}
          </div>
        </div>

        {/* Digest Frequency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Digest Frequency
          </label>
          <div className="space-y-2">
            {DIGEST_FREQUENCIES.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
              >
                <input
                  type="radio"
                  name="digest_frequency"
                  value={option.value}
                  checked={notifPrefs.digest_frequency === option.value}
                  onChange={() =>
                    setNotifPrefs({
                      ...notifPrefs,
                      digest_frequency: option.value,
                    })
                  }
                  className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 dark:border-gray-600"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {/* Digest Day (only when weekly) */}
        {notifPrefs.digest_frequency === "weekly" && (
          <div>
            <label
              htmlFor="digest_day"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Digest Day
            </label>
            <select
              id="digest_day"
              value={notifPrefs.digest_day}
              onChange={(e) =>
                setNotifPrefs({ ...notifPrefs, digest_day: e.target.value })
              }
              className="mt-1 block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            >
              {DIGEST_DAYS.map((day) => (
                <option key={day} value={day}>
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Content Preferences */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Content Preferences
          </label>
          <div className="space-y-3">
            {CONTENT_TOGGLES.map((toggle) => (
              <label
                key={toggle.key}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={Boolean(notifPrefs[toggle.key])}
                  onChange={(e) =>
                    setNotifPrefs({
                      ...notifPrefs,
                      [toggle.key]: e.target.checked,
                    })
                  }
                  className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 dark:border-gray-600 rounded"
                />
                {toggle.label}
              </label>
            ))}
          </div>
        </div>

        {/* Save message */}
        {message && (
          <div
            className={`text-sm ${message.includes("Error") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
          >
            {message}
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <LoadingButton
            type="button"
            onClick={savePreferences}
            loading={loading}
            loadingText="Saving..."
            className="shadow-sm"
          >
            Save Preferences
          </LoadingButton>
        </div>
      </div>
    </SettingsCard>
  );
}
