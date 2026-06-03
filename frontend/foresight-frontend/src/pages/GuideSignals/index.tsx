/**
 * Composer for the Signals guide page. Renders the hero, the always-visible
 * Quick Start row, nine accordion sections, and the footer CTA.
 *
 * The page was previously a 1650 LOC monolith. Per-section state lives in
 * its own component (the source-category expander, the quick-start active
 * card); only the page chrome remains here.
 *
 * @module pages/GuideSignals
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Compass,
  FolderOpen,
  Radio,
} from "lucide-react";
import { GuideFigure } from "@/components/GuideFigure";
import { QuickStart } from "./QuickStart";
import { WhatAreSignals } from "./sections/WhatAreSignals";
import { PersonalHub } from "./sections/PersonalHub";
import { CreatingSignals } from "./sections/CreatingSignals";
import { SourcePreferences } from "./sections/SourcePreferences";
import { FilteringOrganizing } from "./sections/FilteringOrganizing";
import { CommunityTags } from "./sections/CommunityTags";
import { Discussion } from "./sections/Discussion";
import { IntegratingWorkflows } from "./sections/IntegratingWorkflows";
import { TipsBestPractices } from "./sections/TipsBestPractices";

export default function GuideSignals() {
  return (
    <>
      <style>{`
        @media print {
          [data-state="closed"] > [role="region"] {
            display: block !important;
            height: auto !important;
          }
          [data-radix-collection-item] svg.lucide-chevron-down {
            display: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-brand-faded-white dark:bg-brand-dark-blue">
        {/* Hero Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-brand-blue via-brand-blue/90 to-brand-green">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <Link
              to="/signals"
              className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors mb-6 no-print"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to My Signals
            </Link>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <Radio className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                How to Use Signals
              </h1>
            </div>
            <p className="text-white/80 text-lg max-w-2xl leading-relaxed">
              Your personal intelligence hub for tracking emerging trends,
              technologies, and strategic issues. Learn how to discover, create,
              organize, and act on signals that matter to your work.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <GuideFigure
            src="/guide/signal-detail-overview.png"
            alt="A signal's detail page showing the title, summary, action buttons, the Overview tab, and a multi-factor score panel with Impact, Relevance, Velocity, Novelty, and Opportunity ratings."
            caption="A signal's detail page — the summary, multi-factor scores, and every action you can take, from Deep Research to adding it to a workstream."
            className="mt-0 mb-12"
          />

          <QuickStart />

          <Accordion.Root
            type="multiple"
            defaultValue={[]}
            className="divide-y divide-gray-200 dark:divide-gray-700 border-t border-b border-gray-200 dark:border-gray-700"
          >
            <WhatAreSignals />
            <PersonalHub />
            <CreatingSignals />
            <SourcePreferences />
            <FilteringOrganizing />
            <CommunityTags />
            <Discussion />
            <IntegratingWorkflows />
            <TipsBestPractices />
          </Accordion.Root>

          {/* Footer CTA */}
          <section className="mt-14 no-print">
            <div className="rounded-xl border border-brand-blue/20 bg-gradient-to-r from-brand-blue/10 to-brand-green/10 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Continue Learning
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                Explore the other guide pages to master the complete Foresight
                workflow.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <Link
                  to="/guide/discover"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-brand-blue/30"
                >
                  <Compass className="h-5 w-5 text-brand-blue dark:text-brand-light-blue flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      How to Use Discover
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Browse and triage AI-curated signals
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </Link>
                <Link
                  to="/guide/workstreams"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-brand-blue/30"
                >
                  <FolderOpen className="h-5 w-5 text-brand-green flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      How to Use Workstreams
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Deep research and collaboration
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </Link>
                <Link
                  to="/"
                  className="flex items-center gap-3 rounded-lg border border-brand-blue/30 bg-brand-blue/5 dark:bg-brand-blue/10 p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                >
                  <BarChart3 className="h-5 w-5 text-brand-blue dark:text-brand-light-blue flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      Dashboard
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      View your overview and metrics
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </Link>
              </div>
            </div>
          </section>

          <p className="mt-10 text-sm text-gray-400 dark:text-gray-500 text-center no-print">
            Questions about signals or the methodology behind them?{" "}
            <Link
              to="/methodology"
              className="text-brand-blue dark:text-brand-light-blue hover:underline"
            >
              View the full methodology
            </Link>{" "}
            or reach out to the Foresight team.
          </p>
        </div>
      </div>
    </>
  );
}
