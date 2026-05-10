/**
 * Profile settings card. Owns the editable profile state (display name,
 * department, role) and the load/save round-trips against the `users`
 * table in Supabase.
 *
 * @module pages/Settings/ProfileCard
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { User } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuthContext } from "../../hooks/useAuthContext";
import { LoadingButton } from "../../components/ui/LoadingButton";
import { SettingsCard } from "./SettingsCard";

interface ProfileForm {
  display_name: string;
  department: string;
  role: string;
  preferences: Record<string, unknown>;
}

const DEPARTMENTS = [
  "Community Health",
  "Mobility & Connectivity",
  "Housing & Economic Stability",
  "Economic Development",
  "Environmental Sustainability",
  "Cultural & Entertainment",
  "City Manager's Office",
  "Other",
];

const ROLES = [
  "Strategic Planner",
  "Department Head",
  "Analyst",
  "Manager",
  "Director",
  "Other",
];

export function ProfileCard() {
  const { user } = useAuthContext();
  const [profile, setProfile] = useState<ProfileForm>({
    display_name: "",
    department: "",
    role: "",
    preferences: {},
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("id", user?.id)
          .single();

        if (data) {
          setProfile({
            display_name: data.display_name || "",
            department: data.department || "",
            role: data.role || "",
            preferences: data.preferences || {},
          });
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? `Could not load profile: ${error.message}`
            : "Could not load profile.",
        );
      }
    };
    loadProfile();
  }, [user?.id]);

  const updateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("users")
        .update(profile)
        .eq("id", user?.id);

      if (error) throw error;

      setMessage("Profile updated successfully!");
    } catch (error) {
      console.error("Error updating profile:", error);
      setMessage("Error updating profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsCard icon={User} title="Profile">
      <form onSubmit={updateProfile} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={user?.email || ""}
              disabled
              className="mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm bg-gray-50 dark:bg-dark-surface-elevated dark:text-gray-300"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Email cannot be changed. Contact your administrator if needed.
            </p>
          </div>

          <div>
            <label
              htmlFor="display_name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Display Name
            </label>
            <input
              type="text"
              id="display_name"
              value={profile.display_name}
              onChange={(e) =>
                setProfile({ ...profile, display_name: e.target.value })
              }
              className="mt-1 block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
              placeholder="Your name"
            />
          </div>

          <div>
            <label
              htmlFor="department"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Department
            </label>
            <select
              id="department"
              value={profile.department}
              onChange={(e) =>
                setProfile({ ...profile, department: e.target.value })
              }
              className="mt-1 block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            >
              <option value="">Select Department</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Role
            </label>
            <select
              id="role"
              value={profile.role}
              onChange={(e) => setProfile({ ...profile, role: e.target.value })}
              className="mt-1 block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            >
              <option value="">Select Role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {message && (
          <div
            className={`text-sm ${message.includes("Error") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
          >
            {message}
          </div>
        )}

        <div className="flex justify-end">
          <LoadingButton
            type="submit"
            loading={loading}
            loadingText="Updating..."
            className="shadow-sm"
          >
            Update Profile
          </LoadingButton>
        </div>
      </form>
    </SettingsCard>
  );
}
