/**
 * LensMetadataPanel
 *
 * Sidebar summary of lens metadata for the card detail Overview tab. Shows
 * the effective values (LLM ∪ user.added − user.removed) and opens the
 * tagger modal on edit.
 *
 * Provenance badges:
 *   • LLM   = derived by the classifier cascade
 *   • User  = added or overridden by a human
 */

import { useCallback, useEffect, useState } from "react";
import { Pencil, Tag, Landmark, Cloud } from "lucide-react";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import { useCapabilities } from "../../hooks/useCapabilities";

async function getSessionToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
import {
  type AnchorCode,
  type AnchorScores,
  effectiveAnchorScores,
  effectiveArray,
  getStrategicAnchors,
  type PillarCode,
  type SignalType,
  type StrategicAnchor,
  type UserMetadata,
} from "../../lib/lens-api";
import { LensTaggerModal } from "./LensTaggerModal";

export interface BudgetAssessment {
  relevance: number;
  dimensions: string[];
  magnitude_band: string | null;
  cycle: string | null;
  notes: string | null;
}

export interface ClimateAssessment {
  relevance: number;
  drivers: string[];
  horizon: string | null;
  notes: string | null;
}

export interface LensMetadataPanelProps {
  cardId: string;
  primaryPillar: PillarCode | null;
  signalType: SignalType | null;
  llmSecondaryPillars: PillarCode[];
  llmAnchorScores: AnchorScores | null;
  llmIssueTags: string[];
  userMetadata: UserMetadata | null;
  /** From `cards.budget_assessment` JSONB. Read-only display. */
  budgetAssessment?: BudgetAssessment | null;
  /** From `cards.climate_assessment` JSONB. Read-only display. */
  climateAssessment?: ClimateAssessment | null;
  onMetadataChanged?: (next: UserMetadata) => void;
}

function ProvenanceBadge({ source }: { source: "LLM" | "User" }) {
  return (
    <span
      className={cn(
        "ml-2 text-[10px] uppercase tracking-wide font-medium",
        source === "User" ? "text-emerald-600" : "text-gray-400",
      )}
    >
      {source}
    </span>
  );
}

export function LensMetadataPanel({
  cardId,
  primaryPillar,
  signalType,
  llmSecondaryPillars,
  llmAnchorScores,
  llmIssueTags,
  userMetadata,
  budgetAssessment = null,
  climateAssessment = null,
  onMetadataChanged,
}: LensMetadataPanelProps) {
  const { accountType } = useCapabilities();
  const readOnly = accountType === "guest";

  const [anchors, setAnchors] = useState<StrategicAnchor[]>([]);
  const [taggerOpen, setTaggerOpen] = useState(false);
  const [localMetadata, setLocalMetadata] = useState<UserMetadata | null>(
    userMetadata,
  );

  useEffect(() => {
    setLocalMetadata(userMetadata);
  }, [userMetadata]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getSessionToken();
      if (!token) return;
      try {
        const rows = await getStrategicAnchors(token);
        if (!cancelled) setAnchors(rows);
      } catch {
        // Non-fatal — modal falls back to code-only labels.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getAuthToken = useCallback(getSessionToken, []);

  const handleSaved = (next: UserMetadata) => {
    setLocalMetadata(next);
    onMetadataChanged?.(next);
  };

  const effectiveSecondary = effectiveArray(
    llmSecondaryPillars,
    localMetadata,
    "secondary_pillars",
  ) as PillarCode[];

  const effectiveTags = effectiveArray(
    llmIssueTags,
    localMetadata,
    "issue_tags",
  );

  const effectiveAnchors = effectiveAnchorScores(
    llmAnchorScores ?? {
      equity: 0,
      affordability: 0,
      innovation: 0,
      sustainability_resiliency: 0,
      proactive_prevention: 0,
      community_trust: 0,
    },
    localMetadata,
  );

  const userAddedTags = new Set(localMetadata?.added?.["issue_tags"] ?? []);
  const userAddedPillars = new Set(
    localMetadata?.added?.["secondary_pillars"] ?? [],
  );
  const anchorOverrides = (localMetadata?.overrides?.["anchor_scores"] ??
    {}) as Partial<Record<AnchorCode, unknown>>;

  const hasAnyLensData =
    signalType !== null ||
    effectiveSecondary.length > 0 ||
    effectiveTags.length > 0 ||
    llmAnchorScores !== null ||
    budgetAssessment !== null ||
    climateAssessment !== null;

  const budgetRelevance = budgetAssessment?.relevance ?? 0;
  const climateRelevance = climateAssessment?.relevance ?? 0;

  return (
    <>
      <div
        className={cn(
          "rounded-xl border bg-white dark:bg-dark-surface-elevated",
          "border-gray-200 dark:border-gray-700",
          "p-4 sm:p-5",
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-brand-blue" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Lens metadata
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setTaggerOpen(true)}
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              "text-brand-blue hover:underline",
              "disabled:opacity-50 disabled:no-underline",
            )}
            aria-label="Edit lens tags"
          >
            <Pencil className="h-3.5 w-3.5" />
            {readOnly ? "View" : "Edit"}
          </button>
        </div>

        {!hasAnyLensData ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Not yet classified. Run the lens cascade to populate.
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            {signalType && (
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Signal type
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
                  {signalType}
                </span>
              </div>
            )}

            {(primaryPillar || effectiveSecondary.length > 0) && (
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Pillars
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {primaryPillar && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-mono bg-gray-100 dark:bg-dark-surface text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">
                      {primaryPillar}
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-gray-400">
                        primary
                      </span>
                    </span>
                  )}
                  {effectiveSecondary.map((code) => (
                    <span
                      key={code}
                      className="px-2 py-0.5 rounded-md text-xs font-mono bg-gray-50 dark:bg-dark-surface text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                    >
                      {code}
                      <ProvenanceBadge
                        source={userAddedPillars.has(code) ? "User" : "LLM"}
                      />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {llmAnchorScores && (
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Anchors
                </div>
                <div className="space-y-1">
                  {(anchors.length === 6
                    ? anchors.map((a) => ({
                        code: a.code as AnchorCode,
                        name: a.name,
                      }))
                    : (Object.keys(effectiveAnchors) as AnchorCode[]).map(
                        (code) => ({
                          code,
                          name: code,
                        }),
                      )
                  ).map(({ code, name }) => {
                    const value = effectiveAnchors[code];
                    const overridden = code in anchorOverrides;
                    return (
                      <div
                        key={code}
                        className="flex items-center gap-2 text-xs"
                      >
                        <div
                          className="flex-1 truncate text-gray-700 dark:text-gray-300"
                          title={name}
                        >
                          {name}
                        </div>
                        <div className="w-24 h-1.5 rounded bg-gray-100 dark:bg-dark-surface overflow-hidden">
                          <div
                            className="h-full bg-brand-blue"
                            style={{ width: `${value}%` }}
                          />
                        </div>
                        <div className="w-7 text-right tabular-nums text-gray-900 dark:text-white">
                          {value}
                        </div>
                        <ProvenanceBadge source={overridden ? "User" : "LLM"} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {effectiveTags.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Issue tags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {effectiveTags.map((tag) => (
                    <span
                      key={tag}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[11px] font-medium border",
                        userAddedTags.has(tag)
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                          : "bg-gray-50 dark:bg-dark-surface text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700",
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {budgetAssessment && (
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Budget relevance
                  <span className="ml-auto tabular-nums text-gray-900 dark:text-white">
                    {budgetRelevance}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded bg-gray-100 dark:bg-dark-surface overflow-hidden mb-1.5">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(100, budgetRelevance)}%` }}
                  />
                </div>
                {budgetAssessment.dimensions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {budgetAssessment.dimensions.map((d) => (
                      <span
                        key={d}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
                {(budgetAssessment.magnitude_band ||
                  budgetAssessment.cycle) && (
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    {[budgetAssessment.magnitude_band, budgetAssessment.cycle]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
                {budgetAssessment.notes && (
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 leading-snug">
                    {budgetAssessment.notes}
                  </p>
                )}
              </div>
            )}

            {climateAssessment && (
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                  <Cloud className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  Climate relevance
                  <span className="ml-auto tabular-nums text-gray-900 dark:text-white">
                    {climateRelevance}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded bg-gray-100 dark:bg-dark-surface overflow-hidden mb-1.5">
                  <div
                    className="h-full bg-sky-500"
                    style={{ width: `${Math.min(100, climateRelevance)}%` }}
                  />
                </div>
                {climateAssessment.drivers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {climateAssessment.drivers.map((d) => (
                      <span
                        key={d}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-800"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
                {climateAssessment.horizon && (
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    Horizon: {climateAssessment.horizon}
                  </div>
                )}
                {climateAssessment.notes && (
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 leading-snug">
                    {climateAssessment.notes}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <LensTaggerModal
        isOpen={taggerOpen}
        onClose={() => setTaggerOpen(false)}
        cardId={cardId}
        primaryPillar={primaryPillar}
        llmSecondaryPillars={llmSecondaryPillars}
        llmAnchorScores={llmAnchorScores}
        llmIssueTags={llmIssueTags}
        signalType={signalType}
        userMetadata={localMetadata}
        anchors={anchors}
        readOnly={readOnly}
        getAuthToken={getAuthToken}
        onSaved={handleSaved}
      />
    </>
  );
}
