/**
 * Module-level constants for the Create Signal wizard.
 *
 * @module CreateSignal/constants
 */

import type { SourcePreferences } from "./SourcePreferencesStep";
import type { WizardStep } from "./wizardState";

/** Strategic pillar options shown in the manual-mode multi-select. */
export const PILLAR_OPTIONS = [
  { code: "CH", label: "Community Health" },
  { code: "EW", label: "Economic Workforce" },
  { code: "HG", label: "Home & Government" },
  { code: "HH", label: "Housing & Homelessness" },
  { code: "MC", label: "Mobility & Connectivity" },
  { code: "PS", label: "Public Safety" },
] as const;

/** Horizon options mapping display labels to API values. */
export const HORIZON_OPTIONS = [
  { value: "H1", label: "Near-term (H1)" },
  { value: "H2", label: "Mid-term (H2)" },
  { value: "H3", label: "Long-term (H3)" },
] as const;

/**
 * Maturity stage options. Values are the canonical stage *numbers* (1-8); the
 * backend maps them to the matching ``stages`` row id (1_concept..8_declining).
 * Labels must match the canonical taxonomy order — note stage 4 is "Proof of
 * Concept", not "Implementing".
 */
export const STAGE_OPTIONS = [
  { value: "1", label: "Concept" },
  { value: "2", label: "Exploring" },
  { value: "3", label: "Pilot" },
  { value: "4", label: "Proof of Concept" },
  { value: "5", label: "Implementing" },
  { value: "6", label: "Scaling" },
  { value: "7", label: "Mature" },
  { value: "8", label: "Declining" },
] as const;

/** Step labels for the wizard indicator. */
export const STEP_LABELS: Record<WizardStep, string> = {
  1: "Define Signal",
  2: "Source Preferences",
  3: "Review & Create",
};

/** Default source preferences seeded into a fresh wizard. */
export const DEFAULT_SOURCE_PREFERENCES: SourcePreferences = {
  enabled_categories: ["news", "government"],
  preferred_type: "news",
  priority_domains: [],
  custom_rss_feeds: [],
  keywords: [],
};

/** Pillar label lookup. */
export function getPillarLabel(code: string): string {
  return PILLAR_OPTIONS.find((p) => p.code === code)?.label || code;
}

/** Stage label lookup. */
export function getStageLabel(value: string): string {
  return STAGE_OPTIONS.find((s) => s.value === value)?.label || value;
}

/** Horizon label lookup. */
export function getHorizonLabel(value: string): string {
  return HORIZON_OPTIONS.find((h) => h.value === value)?.label || value;
}
