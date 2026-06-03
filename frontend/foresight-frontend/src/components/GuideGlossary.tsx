/**
 * GuideGlossary — a plain-English reference for the handful of Foresight terms
 * a non-technical pilot user keeps bumping into (signal, pillar, horizon, SQI,
 * scope, workstream, the two research depths, and the watching flag).
 *
 * Pillars and horizons are pulled from the canonical taxonomy so the codes,
 * names, and timeframes can never drift from the badges shown elsewhere in the
 * product. Rendered as a semantic `<dl>` for screen-reader navigation.
 *
 * @module components/GuideGlossary
 */

import type { ReactNode } from "react";
import { horizons, pillars } from "@/data/taxonomy";

interface GlossaryEntry {
  term: string;
  definition: ReactNode;
}

const ENTRIES: GlossaryEntry[] = [
  {
    term: "Signal",
    definition:
      "The atomic unit of intelligence in Foresight — a single emerging trend, technology, policy shift, or issue that could affect City of Austin operations. Each signal carries a summary, sources, scores, and classifications.",
  },
  {
    term: "Strategic pillar",
    definition: (
      <>
        One of the six strategic categories Austin organizes its work around.
        Every signal is classified under exactly one:
        <ul className="mt-2 space-y-1">
          {pillars.map((p) => (
            <li key={p.code}>
              <span className="font-semibold text-brand-blue dark:text-brand-light-blue">
                {p.code}
              </span>{" "}
              &mdash; {p.name}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    term: "Time horizon (H1 / H2 / H3)",
    definition: (
      <>
        How far out a signal&rsquo;s main impact sits. Every signal carries one
        horizon badge:
        <ul className="mt-2 space-y-1">
          {horizons.map((h) => (
            <li key={h.code}>
              <span className="font-semibold text-brand-blue dark:text-brand-light-blue">
                {h.code}
              </span>{" "}
              &mdash; {h.name} ({h.timeframe})
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    term: "Maturity stage",
    definition:
      "Where a signal sits on its path from idea to widespread adoption — an eight-step progression from Concept and Exploring, through Pilot, Proof of Concept, Implementing, and Scaling, to Mature and Declining.",
  },
  {
    term: "Signal Quality Index (SQI)",
    definition:
      "A single 0–100 score summarizing how strong and well-evidenced a signal is. It blends the multi-factor scores (Impact, Relevance, Velocity, Novelty, Opportunity, and Risk) — higher means more credible and consequential.",
  },
  {
    term: "Scope",
    definition:
      "What Ask Foresight searches when it answers you: a single signal, one workstream, or all signals. Narrower scopes give more focused, on-topic answers.",
  },
  {
    term: "Workstream",
    definition:
      "A research stream you create around a topic. It gathers the relevant signals, organizes them on a Kanban board, and is where deep research and executive briefs happen.",
  },
  {
    term: "Quick Update vs Deep Dive",
    definition:
      "The two research depths you can run on a signal. A Quick Update is a fast refresh from a handful of sources; a Deep Dive is a comprehensive research package that draws on many more and takes longer.",
  },
  {
    term: "Watching",
    definition:
      "A flag you toggle on a card to get notified when it changes. It is separate from the card's Kanban status (Inbox, Working, Ready, Archived) — watching tracks updates, while status tracks where the card is in your workflow.",
  },
];

export function GuideGlossary() {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
        Glossary
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        A quick reference for the terms you&rsquo;ll see throughout Foresight.
      </p>
      <dl className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface divide-y divide-gray-200 dark:divide-gray-700">
        {ENTRIES.map((entry) => (
          <div
            key={entry.term}
            className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6"
          >
            <dt className="font-semibold text-gray-900 dark:text-white">
              {entry.term}
            </dt>
            <dd className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {entry.definition}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default GuideGlossary;
