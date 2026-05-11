/**
 * Owns the entire Create Signal wizard's mutable state and async behavior:
 *
 *   - `state` (full WizardState) + a stable `updateState` patcher
 *   - Step navigation (`goToStep`) and Step 1 validity (`isStep1Valid`)
 *   - Manual-mode handlers (pillar toggle, exploratory toggle)
 *   - Quick-mode keyword helpers (suggest, remove)
 *   - Submit (`handleCreate`) which branches on `mode` to call either the
 *     quick-topic endpoint or the manual-create endpoint
 *   - Async flags + the created-card payload + an error string
 *
 * The composer feeds initial workstreamId in; this hook also exposes a
 * `resetForAnother` callback used by the "Create Another" button on the
 * success screen.
 *
 * @module CreateSignal/hooks/useCreateSignalWizard
 */

import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "../../../lib/auth";
import {
  createCardFromTopic,
  suggestKeywords,
  type CreateCardFromTopicResponse,
  type Card,
} from "../../../lib/discovery-api";
import { API_BASE_URL } from "../../../lib/config";
import {
  createInitialState,
  type WizardState,
  type WizardStep,
} from "../wizardState";

export interface UseCreateSignalWizardOptions {
  isOpen: boolean;
  workstreamId?: string;
  onSuccess?: () => void;
}

export interface UseCreateSignalWizardResult {
  state: WizardState;
  updateState: (partial: Partial<WizardState>) => void;
  goToStep: (step: WizardStep) => void;
  isStep1Valid: boolean;

  // Step 1 handlers
  handleTogglePillar: (code: string) => void;
  handleExploratoryToggle: (checked: boolean) => void;
  handleSuggestKeywords: () => Promise<void>;
  handleRemoveKeyword: (keyword: string) => void;
  isSuggestingKeywords: boolean;

  // Submit
  handleCreate: () => Promise<void>;
  isCreating: boolean;

  // Result + error
  createdCard: CreateCardFromTopicResponse | Card | null;
  error: string | null;

  // Reset for the success-screen "Create Another" button
  resetForAnother: () => void;
}

export function useCreateSignalWizard({
  isOpen,
  workstreamId,
  onSuccess,
}: UseCreateSignalWizardOptions): UseCreateSignalWizardResult {
  const [state, setState] = useState<WizardState>(() =>
    createInitialState(workstreamId),
  );

  const [isCreating, setIsCreating] = useState(false);
  const [isSuggestingKeywords, setIsSuggestingKeywords] = useState(false);
  const [createdCard, setCreatedCard] = useState<
    CreateCardFromTopicResponse | Card | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Reset wizard state when modal opens
  useEffect(() => {
    if (isOpen) {
      setState(createInitialState(workstreamId));
      setCreatedCard(null);
      setError(null);
      setIsCreating(false);
    }
  }, [isOpen, workstreamId]);

  const updateState = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => ({ ...prev, step }));
    setError(null);
  }, []);

  const handleTogglePillar = useCallback((code: string) => {
    setState((prev) => ({
      ...prev,
      selectedPillars: prev.selectedPillars.includes(code)
        ? prev.selectedPillars.filter((p) => p !== code)
        : [...prev.selectedPillars, code],
    }));
  }, []);

  const handleExploratoryToggle = useCallback((checked: boolean) => {
    setState((prev) => ({
      ...prev,
      isExploratory: checked,
      selectedPillars: checked ? [] : prev.selectedPillars,
    }));
  }, []);

  const handleSuggestKeywords = useCallback(async () => {
    if (!state.topic.trim()) return;

    setIsSuggestingKeywords(true);
    setError(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        setError("Please sign in to use this feature.");
        return;
      }

      const result = await suggestKeywords(state.topic.trim(), token);
      updateState({ keywords: result.suggestions || [] });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to get keyword suggestions.",
      );
    } finally {
      setIsSuggestingKeywords(false);
    }
  }, [state.topic, updateState]);

  const handleRemoveKeyword = useCallback((keyword: string) => {
    setState((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((k) => k !== keyword),
    }));
  }, []);

  const isStep1Valid =
    state.mode === "quick"
      ? state.topic.trim().length > 0
      : state.name.trim().length > 0 && state.description.trim().length > 0;

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setError(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        setError("Please sign in to create signals.");
        return;
      }

      if (state.mode === "quick") {
        const result = await createCardFromTopic(
          {
            topic: state.topic.trim(),
            workstream_id: state.workstreamId || undefined,
            source_preferences: state.sourcePreferences,
            research_depth: state.researchDepth,
            keywords: state.keywords.length > 0 ? state.keywords : undefined,
          } as Record<string, unknown> & {
            topic: string;
            workstream_id?: string;
          },
          token,
        );
        setCreatedCard(result);
        onSuccess?.();
      } else {
        const payload = {
          name: state.name.trim(),
          description: state.description.trim(),
          pillar_ids: state.isExploratory ? [] : state.selectedPillars,
          is_exploratory: state.isExploratory,
          horizon: state.horizon,
          stage: state.stage,
          seed_urls: state.seedUrls.length > 0 ? state.seedUrls : undefined,
          source_preferences: state.sourcePreferences,
          research_depth: state.researchDepth,
        };

        const response = await fetch(
          `${API_BASE_URL}/api/v1/cards/create-manual`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          },
        );

        if (!response.ok) {
          const errData = await response
            .json()
            .catch(() => ({ message: "Request failed" }));
          throw new Error(errData.message || `API error: ${response.status}`);
        }

        const card: Card = await response.json();
        setCreatedCard(card);
        onSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create signal.");
    } finally {
      setIsCreating(false);
    }
  }, [state, onSuccess]);

  const resetForAnother = useCallback(() => {
    setState(createInitialState(workstreamId));
    setCreatedCard(null);
    setError(null);
  }, [workstreamId]);

  return {
    state,
    updateState,
    goToStep,
    isStep1Valid,
    handleTogglePillar,
    handleExploratoryToggle,
    handleSuggestKeywords,
    handleRemoveKeyword,
    isSuggestingKeywords,
    handleCreate,
    isCreating,
    createdCard,
    error,
    resetForAnother,
  };
}
