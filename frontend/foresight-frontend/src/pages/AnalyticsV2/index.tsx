/**
 * Analytics dashboard composer: loads system + personal stats in parallel,
 * exposes a tab switcher, and renders the chosen tab with shared header /
 * footer chrome.
 *
 * @module pages/AnalyticsV2
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BarChart3, Globe, RefreshCw, UserCircle } from "lucide-react";
import { getAuthToken } from "../../lib/auth";
import { useAuthContext } from "../../hooks/useAuthContext";
import { fetchPersonalStats, fetchSystemStats } from "./api";
import { LoadingSkeleton } from "./common";
import { PersonalTab } from "./PersonalTab";
import { QuickLinks } from "./QuickLinks";
import { SystemTab } from "./SystemTab";
import type { PersonalStats, SystemWideStats } from "./types";

type TabKey = "system" | "personal";

export default function AnalyticsV2() {
  useAuthContext();
  const [activeTab, setActiveTab] = useState<TabKey>("system");
  const [systemStats, setSystemStats] = useState<SystemWideStats | null>(null);
  const [personalStats, setPersonalStats] = useState<PersonalStats | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");

      const [system, personal] = await Promise.all([
        fetchSystemStats(token),
        fetchPersonalStats(token),
      ]);

      setSystemStats(system);
      setPersonalStats(personal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8 text-brand-blue" />
            <h1 className="text-3xl font-bold text-brand-dark-blue dark:text-white">
              Analytics
            </h1>
          </div>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="text-red-500 mb-4">{error}</div>
          <button
            onClick={loadData}
            className="inline-flex items-center px-4 py-2 bg-brand-blue text-white rounded-md hover:bg-brand-dark-blue"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-brand-blue" />
            <h1 className="text-3xl font-bold text-brand-dark-blue dark:text-white">
              Analytics
            </h1>
          </div>
          <button
            onClick={loadData}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Refresh data"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          System-wide intelligence and personal engagement insights
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        <TabButton
          active={activeTab === "system"}
          onClick={() => setActiveTab("system")}
          icon={<Globe className="h-4 w-4" />}
          label="System Overview"
        />
        <TabButton
          active={activeTab === "personal"}
          onClick={() => setActiveTab("personal")}
          icon={<UserCircle className="h-4 w-4" />}
          label="Personal Insights"
        />
      </div>

      {activeTab === "system" && systemStats && (
        <SystemTab stats={systemStats} />
      )}
      {activeTab === "personal" && personalStats && (
        <PersonalTab stats={personalStats} />
      )}

      <QuickLinks />

      <div className="mt-6 text-center text-xs text-gray-400">
        Last updated:{" "}
        {new Date(systemStats?.generated_at || Date.now()).toLocaleString()}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        active
          ? "bg-brand-blue text-white"
          : "bg-white dark:bg-dark-surface text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-surface-elevated"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
