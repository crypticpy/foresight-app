/**
 * Discover Page Utilities
 *
 * Utility functions for the Discover page.
 */

import { format, formatDistanceToNow } from "date-fns";
import type { SavedSearchQueryConfig } from "../../lib/discovery-api";
import type { SortOption } from "./types";
import type { QualityFilter } from "./hooks/useCardLoader";

/**
 * Get color classes for score values
 * Green for high (80+), amber for medium (60-79), red for low (<60)
 */
export const getScoreColorClasses = (score: number): string => {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
};

/**
 * Get sort configuration based on selected sort option
 */
export const getSortConfig = (
  option: SortOption,
): { column: string; ascending: boolean } => {
  switch (option) {
    case "oldest":
      return { column: "created_at", ascending: true };
    case "recently_updated":
      return { column: "updated_at", ascending: false };
    case "least_recently_updated":
      return { column: "updated_at", ascending: true };
    case "signal_quality_score":
      return { column: "signal_quality_score", ascending: false };
    case "newest":
    default:
      return { column: "created_at", ascending: false };
  }
};

/**
 * Format card date for display
 * Shows relative time for recent updates, absolute date for creation
 */
export const formatCardDate = (
  createdAt: string,
  updatedAt?: string,
): { label: string; text: string } => {
  try {
    const created = new Date(createdAt);
    const updated = updatedAt ? new Date(updatedAt) : null;

    // If updated_at exists and is different from created_at (more than 1 minute difference)
    if (updated && Math.abs(updated.getTime() - created.getTime()) > 60000) {
      return {
        label: "Updated",
        text: formatDistanceToNow(updated, { addSuffix: true }),
      };
    }

    // Fall back to created_at with absolute date format
    return {
      label: "Created",
      text: format(created, "MMM d, yyyy"),
    };
  } catch {
    // Handle invalid dates gracefully
    return {
      label: "Created",
      text: "Unknown",
    };
  }
};

/**
 * Inputs to {@link buildSavedSearchConfig} — mirrors the filter state owned
 * by the Discover composer.
 */
export interface SavedSearchInputs {
  searchTerm: string;
  selectedPillar: string;
  selectedStage: string;
  selectedHorizon: string;
  dateFrom: string;
  dateTo: string;
  impactMin: number;
  relevanceMin: number;
  noveltyMin: number;
  useSemanticSearch: boolean;
  qualityFilter: QualityFilter;
}

/**
 * Build a {@link SavedSearchQueryConfig} from the Discover page's current
 * filter inputs. Used by both the Save Search modal and the recent-searches
 * recorder so the two stay in sync.
 */
export const buildSavedSearchConfig = (
  inputs: SavedSearchInputs,
): SavedSearchQueryConfig => {
  const {
    searchTerm,
    selectedPillar,
    selectedStage,
    selectedHorizon,
    dateFrom,
    dateTo,
    impactMin,
    relevanceMin,
    noveltyMin,
    useSemanticSearch,
    qualityFilter,
  } = inputs;

  const config: SavedSearchQueryConfig = {
    use_vector_search: useSemanticSearch,
  };

  if (searchTerm.trim()) {
    config.query = searchTerm.trim();
  }

  const filters: SavedSearchQueryConfig["filters"] = {};

  if (selectedPillar) filters.pillar_ids = [selectedPillar];
  if (selectedStage) filters.stage_ids = [selectedStage];
  if (selectedHorizon) filters.horizon = selectedHorizon as "H1" | "H2" | "H3";
  if (dateFrom || dateTo) {
    filters.date_range = {
      ...(dateFrom && { start: dateFrom }),
      ...(dateTo && { end: dateTo }),
    };
  }
  if (impactMin > 0 || relevanceMin > 0 || noveltyMin > 0) {
    filters.score_thresholds = {
      ...(impactMin > 0 && { impact_score: { min: impactMin } }),
      ...(relevanceMin > 0 && { relevance_score: { min: relevanceMin } }),
      ...(noveltyMin > 0 && { novelty_score: { min: noveltyMin } }),
    };
  }
  if (qualityFilter && qualityFilter !== "all") {
    filters.quality_filter = qualityFilter;
  }

  if (Object.keys(filters).length > 0) {
    config.filters = filters;
  }

  return config;
};

/**
 * Build a short, human-readable description of a saved-search query config.
 * Used by the recent-searches list to show what each entry will load.
 */
export const getHistoryDescription = (
  config: SavedSearchQueryConfig,
): string => {
  const parts: string[] = [];

  if (config.query) {
    parts.push(`"${config.query}"`);
  }

  if (config.filters) {
    const { pillar_ids, stage_ids, horizon, date_range, score_thresholds } =
      config.filters;

    if (pillar_ids && pillar_ids.length > 0) {
      parts.push(`${pillar_ids.length} pillar(s)`);
    }
    if (stage_ids && stage_ids.length > 0) {
      parts.push(`${stage_ids.length} stage(s)`);
    }
    if (horizon && horizon !== "ALL") {
      parts.push(`${horizon}`);
    }
    if (date_range && (date_range.start || date_range.end)) {
      parts.push("date filter");
    }
    if (score_thresholds && Object.keys(score_thresholds).length > 0) {
      parts.push("score filters");
    }
  }

  if (parts.length === 0 && !config.use_vector_search) {
    return "All signals";
  }

  return (
    parts.join(" • ") ||
    (config.use_vector_search ? "Semantic search" : "All signals")
  );
};

/**
 * Format relative time for history entries
 */
export const formatHistoryTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
};
