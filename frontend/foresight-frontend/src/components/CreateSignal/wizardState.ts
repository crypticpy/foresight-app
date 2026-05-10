/**
 * Shared types and initial-state factory for the Create Signal wizard.
 *
 * @module CreateSignal/wizardState
 */

import type { SourcePreferences } from "./SourcePreferencesStep";
import { DEFAULT_SOURCE_PREFERENCES } from "./constants";

/** Wizard step numbers. */
export type WizardStep = 1 | 2 | 3;

/** Signal creation mode. */
export type CreateMode = "quick" | "manual";

/** Research depth option. */
export type ResearchDepth = "quick" | "deep";

/** Full wizard state. */
export interface WizardState {
  step: WizardStep;
  mode: CreateMode;
  // Quick mode data
  topic: string;
  workstreamId: string;
  keywords: string[];
  // Manual mode data
  name: string;
  description: string;
  selectedPillars: string[];
  isExploratory: boolean;
  horizon: string;
  stage: string;
  seedUrls: string[];
  // Source preferences (step 2)
  sourcePreferences: SourcePreferences;
  // Step 3
  researchDepth: ResearchDepth;
}

/** Workstream option for the dropdown. */
export interface WorkstreamOption {
  id: string;
  name: string;
}

/** Build a fresh wizard state, optionally pre-seeded with a workstream id. */
export function createInitialState(workstreamId?: string): WizardState {
  return {
    step: 1,
    mode: "quick",
    topic: "",
    workstreamId: workstreamId || "",
    keywords: [],
    name: "",
    description: "",
    selectedPillars: [],
    isExploratory: false,
    horizon: "H2",
    stage: "1",
    seedUrls: [],
    sourcePreferences: { ...DEFAULT_SOURCE_PREFERENCES },
    researchDepth: "quick",
  };
}
