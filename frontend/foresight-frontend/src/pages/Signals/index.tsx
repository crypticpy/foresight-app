/**
 * Personal Signals page composer: owns filter / sort / group / view state,
 * coordinates the data fetch via `fetchMySignals`, runs the optimistic-update
 * pin handler, and renders the hero / stats / filter / group sections.
 *
 * @module pages/Signals
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, X } from "lucide-react";
import { CreateSignalModal } from "../../components/CreateSignal";
import { useAuthContext } from "../../hooks/useAuthContext";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { fetchMySignals, togglePin } from "./api";
import { EmptyState } from "./EmptyState";
import { FilterBar } from "./FilterBar";
import { HeroHeader } from "./HeroHeader";
import { SignalGroup } from "./SignalGroup";
import { StatsRow } from "./StatsRow";
import type {
  GroupBy,
  PersonalSignal,
  SignalStats,
  SortOption,
  SourceFilter,
  ViewMode,
  WorkstreamRef,
} from "./types";

const INITIAL_STATS: SignalStats = {
  total: 0,
  followed_count: 0,
  created_count: 0,
  workstream_count: 0,
  updates_this_week: 0,
  needs_research: 0,
};

const SORT_PARAM_MAP: Record<SortOption, string> = {
  recently_updated: "updated",
  date_followed: "followed",
  quality_desc: "quality",
  name_asc: "name",
};

export default function Signals() {
  useAuthContext();

  const [signals, setSignals] = useState<PersonalSignal[]>([]);
  const [stats, setStats] = useState<SignalStats>(INITIAL_STATS);
  // Stored for potential filter enhancements; currently workstream grouping
  // reads workstream_names from each signal directly.
  const [, setWorkstreams] = useState<WorkstreamRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateSignal, setShowCreateSignal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPillar, setSelectedPillar] = useState("");
  const [selectedHorizon, setSelectedHorizon] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("");
  const [qualityMin, setQualityMin] = useState(0);
  const [sortOption, setSortOption] = useState<SortOption>("recently_updated");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const { debouncedValue: debouncedSearch } = useDebouncedValue(
    searchTerm,
    300,
  );

  const uniquePillars = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => {
      if (s.pillar_id) set.add(s.pillar_id);
    });
    return Array.from(set).sort();
  }, [signals]);

  const loadSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (selectedPillar) params.pillar = selectedPillar;
      if (selectedHorizon) params.horizon = selectedHorizon;
      if (sourceFilter) params.source = sourceFilter;
      if (qualityMin > 0) params.quality_min = String(qualityMin);
      params.sort_by = SORT_PARAM_MAP[sortOption];

      const data = await fetchMySignals(params);
      setSignals(data.signals);
      setStats(data.stats);
      setWorkstreams(data.workstreams);
    } catch (err) {
      console.error("Error loading signals:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load signals. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearch,
    selectedPillar,
    selectedHorizon,
    sourceFilter,
    qualityMin,
    sortOption,
  ]);

  useEffect(() => {
    loadSignals();
  }, [loadSignals]);

  const handleTogglePin = useCallback(
    async (cardId: string, currentlyPinned: boolean) => {
      // Optimistic update — togglePin also follows/unfollows, so reflect both
      // is_followed and the followed_count stat alongside is_pinned.
      const wasFollowed = signals.find((s) => s.id === cardId)?.is_followed;
      setSignals((prev) =>
        prev.map((s) =>
          s.id === cardId
            ? {
                ...s,
                is_pinned: !currentlyPinned,
                is_followed: !currentlyPinned,
              }
            : s,
        ),
      );
      setStats((prev) => {
        const delta = !currentlyPinned
          ? wasFollowed
            ? 0
            : 1
          : wasFollowed
            ? -1
            : 0;
        return delta === 0
          ? prev
          : {
              ...prev,
              followed_count: Math.max(0, prev.followed_count + delta),
            };
      });
      try {
        await togglePin(cardId, !currentlyPinned);
      } catch (err) {
        setSignals((prev) =>
          prev.map((s) =>
            s.id === cardId
              ? { ...s, is_pinned: currentlyPinned, is_followed: !!wasFollowed }
              : s,
          ),
        );
        setStats((prev) => {
          const delta = !currentlyPinned
            ? wasFollowed
              ? 0
              : -1
            : wasFollowed
              ? 1
              : 0;
          return delta === 0
            ? prev
            : {
                ...prev,
                followed_count: Math.max(0, prev.followed_count + delta),
              };
        });
        setError(
          err instanceof Error
            ? err.message
            : currentlyPinned
              ? "Failed to unpin signal"
              : "Failed to pin signal",
        );
      }
    },
    [signals],
  );

  // Pinned signals always come first within their group (stable sort).
  const sortedSignals = useMemo(() => {
    const copy = [...signals];
    copy.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return 0;
    });
    return copy;
  }, [signals]);

  const groupedSignals = useMemo<
    { key: string; label: string; signals: PersonalSignal[] }[]
  >(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "", signals: sortedSignals }];
    }

    const groups = new Map<string, PersonalSignal[]>();

    sortedSignals.forEach((signal) => {
      let keys: string[] = [];
      if (groupBy === "pillar") {
        keys = [signal.pillar_id || "Unknown"];
      } else if (groupBy === "horizon") {
        keys = [signal.horizon || "Unknown"];
      } else if (groupBy === "workstream") {
        keys =
          signal.workstream_names.length > 0
            ? signal.workstream_names
            : ["No Workstream"];
      }
      keys.forEach((k) => {
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(signal);
      });
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, sigs]) => ({ key, label: key, signals: sigs }));
  }, [sortedSignals, groupBy]);

  const hasActiveFilters =
    searchTerm !== "" ||
    selectedPillar !== "" ||
    selectedHorizon !== "" ||
    sourceFilter !== "" ||
    qualityMin > 0;

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedPillar("");
    setSelectedHorizon("");
    setSourceFilter("");
    setQualityMin(0);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <HeroHeader onCreateClick={() => setShowCreateSignal(true)} />

      <StatsRow stats={stats} />

      <FilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedPillar={selectedPillar}
        onPillarChange={setSelectedPillar}
        uniquePillars={uniquePillars}
        selectedHorizon={selectedHorizon}
        onHorizonChange={setSelectedHorizon}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        sortOption={sortOption}
        onSortChange={setSortOption}
        qualityMin={qualityMin}
        onQualityMinChange={setQualityMin}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        resultCount={sortedSignals.length}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">
                {error}
              </p>
              <button
                onClick={() => {
                  setError(null);
                  loadSignals();
                }}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-brand-blue animate-spin" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Loading your signals...
          </p>
        </div>
      ) : sortedSignals.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} />
      ) : (
        <div className="space-y-8">
          {groupedSignals.map((group) => (
            <SignalGroup
              key={group.key}
              label={group.label}
              groupBy={groupBy}
              signals={group.signals}
              viewMode={viewMode}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>
      )}

      <CreateSignalModal
        isOpen={showCreateSignal}
        onClose={() => setShowCreateSignal(false)}
        onSuccess={() => {
          loadSignals();
          setShowCreateSignal(false);
        }}
      />
    </div>
  );
}
