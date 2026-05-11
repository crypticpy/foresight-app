/**
 * Main filters card on the Discover page: search box (with semantic toggle),
 * pillar / stage / horizon / sort selects, date range, and the three score
 * threshold sliders (Impact / Relevance / Novelty). Heavy on layout but holds
 * no state of its own — every input is a controlled value.
 *
 * @module pages/Discover/components/FiltersPanel
 */

import { Calendar, Search, Sparkles } from "lucide-react";
import type { Pillar, SortOption, Stage } from "../types";
import { getScoreColorClasses } from "../utils";

interface ScoreSliderProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function ScoreSlider({ id, label, value, onChange }: ScoreSliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label
          htmlFor={id}
          className="text-sm text-gray-600 dark:text-gray-400"
        >
          {label}
        </label>
        <span
          className={`text-sm font-medium ${value > 0 ? getScoreColorClasses(value) : "text-gray-500 dark:text-gray-400"}`}
        >
          {value > 0 ? `≥ ${value}` : "Any"}
        </span>
      </div>
      <input
        type="range"
        id={id}
        min="0"
        max="100"
        step="5"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-blue"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

export interface FiltersPanelProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  useSemanticSearch: boolean;
  onToggleSemanticSearch: (value: boolean) => void;

  pillars: Pillar[];
  selectedPillar: string;
  onSelectedPillarChange: (value: string) => void;

  stages: Stage[];
  selectedStage: string;
  onSelectedStageChange: (value: string) => void;

  selectedHorizon: string;
  onSelectedHorizonChange: (value: string) => void;

  sortOption: SortOption;
  onSortOptionChange: (value: SortOption) => void;

  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;

  impactMin: number;
  onImpactMinChange: (value: number) => void;
  relevanceMin: number;
  onRelevanceMinChange: (value: number) => void;
  noveltyMin: number;
  onNoveltyMinChange: (value: number) => void;

  /** Optional slot rendered at the bottom (used for the search history panel). */
  footer?: React.ReactNode;
}

export function FiltersPanel({
  searchTerm,
  onSearchTermChange,
  useSemanticSearch,
  onToggleSemanticSearch,
  pillars,
  selectedPillar,
  onSelectedPillarChange,
  stages,
  selectedStage,
  onSelectedStageChange,
  selectedHorizon,
  onSelectedHorizonChange,
  sortOption,
  onSortOptionChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  impactMin,
  onImpactMinChange,
  relevanceMin,
  onRelevanceMinChange,
  noveltyMin,
  onNoveltyMinChange,
  footer,
}: FiltersPanelProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="lg:col-span-2">
          <label
            htmlFor="search"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              id="search"
              className="pl-10 block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
              placeholder={
                useSemanticSearch
                  ? "Semantic search (finds related concepts)..."
                  : "Search signals..."
              }
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={useSemanticSearch}
              onClick={() => onToggleSemanticSearch(!useSemanticSearch)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 ${
                useSemanticSearch
                  ? "bg-extended-purple"
                  : "bg-gray-200 dark:bg-gray-600"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  useSemanticSearch ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <label
              className={`flex items-center gap-1.5 text-sm cursor-pointer ${
                useSemanticSearch
                  ? "text-extended-purple font-medium"
                  : "text-gray-600 dark:text-gray-400"
              }`}
              onClick={() => onToggleSemanticSearch(!useSemanticSearch)}
            >
              <Sparkles
                className={`h-4 w-4 ${useSemanticSearch ? "text-extended-purple" : "text-gray-400"}`}
              />
              Semantic Search
            </label>
            {useSemanticSearch && (
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                (finds conceptually related signals)
              </span>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="pillar"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Strategic Pillar
          </label>
          <select
            id="pillar"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={selectedPillar}
            onChange={(e) => onSelectedPillarChange(e.target.value)}
          >
            <option value="">All Pillars</option>
            {pillars.map((pillar) => (
              <option key={pillar.id} value={pillar.id}>
                {pillar.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="stage"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Maturity Stage
          </label>
          <select
            id="stage"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={selectedStage}
            onChange={(e) => onSelectedStageChange(e.target.value)}
          >
            <option value="">All Stages</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="horizon"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Horizon
          </label>
          <select
            id="horizon"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={selectedHorizon}
            onChange={(e) => onSelectedHorizonChange(e.target.value)}
          >
            <option value="">All Horizons</option>
            <option value="H1">H1 (0-2 years)</option>
            <option value="H2">H2 (2-5 years)</option>
            <option value="H3">H3 (5+ years)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="sort"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Sort By
          </label>
          <select
            id="sort"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={sortOption}
            onChange={(e) => onSortOptionChange(e.target.value as SortOption)}
          >
            <option value="newest">Newest Created</option>
            <option value="oldest">Oldest First</option>
            <option value="recently_updated">Recently Updated</option>
            <option value="least_recently_updated">
              Least Recently Updated
            </option>
            <option value="signal_quality_score">Quality Score</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
        <div className="lg:col-span-2 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Date Range:
          </span>
        </div>
        <div>
          <label
            htmlFor="dateFrom"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Created After
          </label>
          <input
            type="date"
            id="dateFrom"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="dateTo"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Created Before
          </label>
          <input
            type="date"
            id="dateTo"
            className="block w-full border-gray-300 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-100 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Minimum Score Thresholds
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ScoreSlider
            id="impactMin"
            label="Impact"
            value={impactMin}
            onChange={onImpactMinChange}
          />
          <ScoreSlider
            id="relevanceMin"
            label="Relevance"
            value={relevanceMin}
            onChange={onRelevanceMinChange}
          />
          <ScoreSlider
            id="noveltyMin"
            label="Novelty"
            value={noveltyMin}
            onChange={onNoveltyMinChange}
          />
        </div>
      </div>

      {footer}
    </div>
  );
}
