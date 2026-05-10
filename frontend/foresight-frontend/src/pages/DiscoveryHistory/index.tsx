/**
 * Discovery History page composer: lists past discovery runs, lets the user
 * trigger or cancel a run, polls every 3 s while any run is active, and shows
 * aggregate stats across all loaded runs.
 *
 * @module pages/DiscoveryHistory
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  Zap,
} from "lucide-react";
import { getAuthToken } from "../../lib/auth";
import { useAuthContext } from "../../hooks/useAuthContext";
import {
  cancelDiscoveryRun,
  fetchDiscoveryRuns,
  triggerDiscoveryRun,
  type DiscoveryRun,
} from "../../lib/discovery-api";
import { RunRow } from "./RunRow";
import { StatCard } from "./StatCard";

export default function DiscoveryHistory() {
  const { user } = useAuthContext();
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadRuns = useCallback(
    async (isInitial = false) => {
      if (!user) return;

      try {
        if (isInitial) {
          setInitialLoading(true);
        } else {
          setRefreshing(true);
        }
        setError(null);

        const token = await getAuthToken();
        if (!token) {
          throw new Error("Not authenticated");
        }

        const data = await fetchDiscoveryRuns(token, 20);
        setRuns(data);
      } catch (err) {
        console.error("Failed to load discovery runs:", err);
        setError(err instanceof Error ? err.message : "Failed to load runs");
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    loadRuns(true);
  }, [loadRuns]);

  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running");
    if (!hasRunning) return;

    const interval = setInterval(() => loadRuns(false), 3000);
    return () => clearInterval(interval);
  }, [runs, loadRuns]);

  const handleTriggerRun = async () => {
    if (!user) return;

    try {
      setTriggerLoading(true);
      setError(null);

      const token = await getAuthToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      await triggerDiscoveryRun(token);
      await loadRuns(false);
    } catch (err) {
      console.error("Failed to trigger discovery run:", err);
      setError(err instanceof Error ? err.message : "Failed to trigger run");
    } finally {
      setTriggerLoading(false);
    }
  };

  const handleCancelRun = async (runId: string) => {
    if (!user) return;

    try {
      setCancellingId(runId);

      const token = await getAuthToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      await cancelDiscoveryRun(token, runId);
      await loadRuns(false);
    } catch (err) {
      console.error("Failed to cancel run:", err);
      setError(err instanceof Error ? err.message : "Failed to cancel run");
    } finally {
      setCancellingId(null);
    }
  };

  const stats = {
    totalRuns: runs.length,
    totalCardsCreated: runs.reduce((sum, r) => sum + (r.cards_created || 0), 0),
    totalCardsUpdated: runs.reduce(
      (sum, r) => sum + (r.cards_enriched || 0),
      0,
    ),
    totalSources: runs.reduce((sum, r) => sum + (r.sources_found || 0), 0),
  };

  const hasRunningJob = runs.some((r) => r.status === "running");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20 pb-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            to="/discover"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-brand-blue mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Discover
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Discovery History
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                View past discovery runs and trigger new ones
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => loadRuns(false)}
                disabled={refreshing}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-brand-blue hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw
                  className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
              <button
                onClick={handleTriggerRun}
                disabled={triggerLoading || hasRunningJob}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white font-medium rounded-lg hover:bg-brand-dark-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {triggerLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : hasRunningJob ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Run in Progress
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Trigger Discovery
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {!initialLoading && runs.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Total Runs"
              value={stats.totalRuns}
              icon={<Calendar className="w-5 h-5 text-gray-600" />}
              color="bg-gray-50 dark:bg-dark-surface border-gray-200 dark:border-gray-700"
            />
            <StatCard
              label="Signals Created"
              value={stats.totalCardsCreated}
              icon={<Zap className="w-5 h-5 text-green-600" />}
              color="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
            />
            <StatCard
              label="Signals Updated"
              value={stats.totalCardsUpdated}
              icon={<RefreshCw className="w-5 h-5 text-blue-600" />}
              color="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            />
            <StatCard
              label="Sources Found"
              value={stats.totalSources}
              icon={<FileText className="w-5 h-5 text-purple-600" />}
              color="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
            />
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <span className="text-red-800 dark:text-red-200">{error}</span>
          </div>
        )}

        {initialLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
          </div>
        )}

        {!initialLoading && runs.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-700">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No Discovery Runs Yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Discovery runs automatically every Sunday at 2 AM UTC, or you can
              trigger one manually.
            </p>
            <button
              onClick={handleTriggerRun}
              disabled={triggerLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white font-medium rounded-lg hover:bg-brand-dark-blue transition-colors disabled:opacity-50"
            >
              {triggerLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run First Discovery
                </>
              )}
            </button>
          </div>
        )}

        {!initialLoading && runs.length > 0 && (
          <div className="space-y-3">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                onCancel={handleCancelRun}
                cancelling={cancellingId === run.id}
              />
            ))}
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-blue-900 dark:text-blue-100">
                Automatic Discovery Schedule
              </div>
              <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                Discovery runs automatically every Sunday at 2:00 AM UTC. The
                system searches for emerging trends aligned with Austin's
                strategic priorities and creates new signals for review.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
