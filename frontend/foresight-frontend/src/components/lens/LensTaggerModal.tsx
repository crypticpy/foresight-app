/**
 * LensTaggerModal
 *
 * Edits per-card lens metadata via the user-metadata overlay. The modal is
 * a v1 of the design in `docs/18_FEATURE_Lens_Architecture.md` §6 — covers
 * the high-traffic edits (anchors, issue tags, secondary pillars). The full
 * CSP goal/measure tree is deferred; v1 displays current CSP tagging
 * read-only.
 *
 * Browse-only (guest) accounts see read-only fields and a disabled save.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  ANCHOR_CODES,
  type AnchorCode,
  type AnchorScores,
  effectiveAnchorScores,
  effectiveArray,
  ISSUE_TAGS,
  type IssueTag,
  patchUserMetadata,
  PILLAR_CODES,
  type PillarCode,
  SIGNAL_TYPES,
  type SignalType,
  type StrategicAnchor,
  type UserMetadata,
} from "../../lib/lens-api";

export interface LensTaggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  /** Primary pillar — listed but not editable (use card edit flow). */
  primaryPillar: PillarCode | null;
  /** LLM-derived secondary pillars on the card. */
  llmSecondaryPillars: PillarCode[];
  /** LLM-derived anchor scores. May be null on un-classified cards. */
  llmAnchorScores: AnchorScores | null;
  /** LLM-derived issue tags. */
  llmIssueTags: string[];
  /** LLM-derived signal_type (read-only in v1). */
  signalType: SignalType | null;
  /** Current user_metadata blob from cards row. */
  userMetadata: UserMetadata | null;
  /** Anchor display config from `/api/v1/lens/strategic-anchors`. */
  anchors: StrategicAnchor[];
  /** True when the user is browse-only / guest. */
  readOnly: boolean;
  getAuthToken: () => Promise<string | null>;
  /** Called with the updated `user_metadata` blob after a successful save. */
  onSaved: (next: UserMetadata) => void;
}

const PILLAR_NAMES: Record<PillarCode, string> = {
  CH: "Community Health & Sustainability",
  EW: "Economic & Workforce Development",
  HG: "High-Performing Government",
  HH: "Homelessness & Housing",
  MC: "Mobility & Critical Infrastructure",
  PS: "Public Safety",
};

function zeroAnchors(): AnchorScores {
  return {
    equity: 0,
    affordability: 0,
    innovation: 0,
    sustainability_resiliency: 0,
    proactive_prevention: 0,
    community_trust: 0,
  };
}

export function LensTaggerModal({
  isOpen,
  onClose,
  cardId,
  primaryPillar,
  llmSecondaryPillars,
  llmAnchorScores,
  llmIssueTags,
  signalType,
  userMetadata,
  anchors,
  readOnly,
  getAuthToken,
  onSaved,
}: LensTaggerModalProps) {
  const initialAnchors = useMemo(
    () => effectiveAnchorScores(llmAnchorScores ?? zeroAnchors(), userMetadata),
    [llmAnchorScores, userMetadata],
  );

  const initialSecondaryPillars = useMemo(
    () =>
      effectiveArray(
        llmSecondaryPillars,
        userMetadata,
        "secondary_pillars",
      ) as PillarCode[],
    [llmSecondaryPillars, userMetadata],
  );

  const initialIssueTags = useMemo(
    () => effectiveArray(llmIssueTags, userMetadata, "issue_tags"),
    [llmIssueTags, userMetadata],
  );

  const [anchorScores, setAnchorScores] =
    useState<AnchorScores>(initialAnchors);
  const [secondaryPillars, setSecondaryPillars] = useState<PillarCode[]>(
    initialSecondaryPillars,
  );
  const [issueTags, setIssueTags] = useState<string[]>(initialIssueTags);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAnchorScores(initialAnchors);
      setSecondaryPillars(initialSecondaryPillars);
      setIssueTags(initialIssueTags);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen, initialAnchors, initialSecondaryPillars, initialIssueTags]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, submitting]);

  if (!isOpen) return null;

  const togglePillar = (code: PillarCode) => {
    if (code === primaryPillar) return;
    setSecondaryPillars((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const toggleIssueTag = (tag: IssueTag) => {
    setIssueTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const setAnchor = (code: AnchorCode, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setAnchorScores((prev) => ({
      ...prev,
      [code]: Math.max(0, Math.min(100, Math.trunc(n))),
    }));
  };

  /**
   * Compute the patch payload by diffing edited values against the LLM layer.
   * Adds go to `added`, removals from the LLM set go to `removed`. For
   * anchor scores we always write the override blob (small; simpler).
   */
  const buildPatch = () => {
    const llmSecondarySet = new Set(llmSecondaryPillars);
    const editedSecondarySet = new Set(secondaryPillars);
    const secondaryAdded = secondaryPillars.filter(
      (c) => !llmSecondarySet.has(c),
    );
    const secondaryRemoved = llmSecondaryPillars.filter(
      (c) => !editedSecondarySet.has(c),
    );

    const llmTagSet = new Set(llmIssueTags);
    const editedTagSet = new Set(issueTags);
    const tagsAdded = issueTags.filter((t) => !llmTagSet.has(t));
    const tagsRemoved = llmIssueTags.filter((t) => !editedTagSet.has(t));

    return {
      overrides: {
        ...(userMetadata?.overrides ?? {}),
        anchor_scores: anchorScores,
      },
      added: {
        ...(userMetadata?.added ?? {}),
        secondary_pillars: secondaryAdded,
        issue_tags: tagsAdded,
      },
      removed: {
        ...(userMetadata?.removed ?? {}),
        secondary_pillars: secondaryRemoved,
        issue_tags: tagsRemoved,
      },
    };
  };

  const handleSave = async () => {
    if (readOnly) return;
    const token = await getAuthToken();
    if (!token) {
      setError("Authentication required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const next = await patchUserMetadata(token, cardId, buildPatch());
      onSaved(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tags");
    } finally {
      setSubmitting(false);
    }
  };

  const anchorOrder = anchors.length === 6 ? anchors : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className={cn(
          "w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl",
          "bg-white dark:bg-dark-surface-elevated",
          "border border-gray-200 dark:border-gray-700",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lens-tagger-title"
      >
        <div className="flex items-start justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-brand-blue" />
            <h2
              id="lens-tagger-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Tag this signal
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-surface disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {readOnly && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-200">
              Browse-only access — tag values are visible but cannot be edited.
            </div>
          )}

          {signalType && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Signal type
              </h3>
              <div className="flex gap-2">
                {SIGNAL_TYPES.map((t) => (
                  <span
                    key={t}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border",
                      t === signalType
                        ? "bg-brand-blue text-white border-brand-blue"
                        : "bg-gray-50 dark:bg-dark-surface text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700",
                    )}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Strategic Pillars
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Primary pillar is fixed by the card. Toggle additional pillars for
              cross-cutting signals.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PILLAR_CODES.map((code) => {
                const isPrimary = code === primaryPillar;
                const checked = isPrimary || secondaryPillars.includes(code);
                const wasLlm = llmSecondaryPillars.includes(code);
                return (
                  <label
                    key={code}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md border text-sm",
                      isPrimary || readOnly
                        ? "cursor-default opacity-90"
                        : "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-surface",
                      "border-gray-200 dark:border-gray-700",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPrimary || readOnly || submitting}
                      onChange={() => togglePillar(code)}
                      className="h-4 w-4"
                    />
                    <span className="text-gray-900 dark:text-white">
                      <span className="font-mono mr-1.5">{code}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {PILLAR_NAMES[code]}
                      </span>
                    </span>
                    {isPrimary && (
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-brand-blue">
                        Primary
                      </span>
                    )}
                    {!isPrimary && checked && !wasLlm && (
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-emerald-600">
                        User
                      </span>
                    )}
                    {!isPrimary && checked && wasLlm && (
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
                        LLM
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Strategic Anchors
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Score 0-100 against each anchor. Edits override the LLM scores.
            </p>
            <div className="space-y-2">
              {(
                anchorOrder ??
                ANCHOR_CODES.map((code) => ({
                  code,
                  name: code,
                  description: null,
                  display_order: 0,
                }))
              ).map((a) => {
                const code = a.code as AnchorCode;
                const value = anchorScores[code] ?? 0;
                const llmValue = llmAnchorScores?.[code] ?? 0;
                const isOverride = value !== llmValue;
                return (
                  <div
                    key={code}
                    className="flex items-center gap-3 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {a.name}
                      </div>
                      {a.description && (
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {a.description}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 w-10 text-right">
                      {isOverride ? "User" : "LLM"}
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={value}
                      disabled={readOnly || submitting}
                      onChange={(e) => setAnchor(code, e.target.value)}
                      className={cn(
                        "w-20 px-2 py-1 rounded-md border text-sm text-right",
                        "border-gray-200 dark:border-gray-700",
                        "bg-white dark:bg-dark-surface",
                        "text-gray-900 dark:text-white",
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Issue tags
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Closed vocabulary. Toggle tags that match the signal — most
              signals match 0-2.
            </p>
            <div className="flex flex-wrap gap-2">
              {ISSUE_TAGS.map((tag) => {
                const checked = issueTags.includes(tag);
                const wasLlm = llmIssueTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    disabled={readOnly || submitting}
                    onClick={() => toggleIssueTag(tag)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors duration-200",
                      checked
                        ? wasLlm
                          ? "bg-brand-blue/10 text-brand-blue border-brand-blue"
                          : "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                        : "bg-gray-50 dark:bg-dark-surface text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100",
                      readOnly && "opacity-70 cursor-not-allowed",
                    )}
                  >
                    {tag}
                    {checked && !wasLlm && <span className="ml-1">·user</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={readOnly || submitting}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md text-white",
              "bg-brand-blue hover:bg-brand-blue/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center gap-2",
            )}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Save tags
          </button>
        </div>
      </div>
    </div>
  );
}
