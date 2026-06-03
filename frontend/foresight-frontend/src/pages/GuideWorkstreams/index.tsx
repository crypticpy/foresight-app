/**
 * GuideWorkstreams — long-form documentation page that walks users through
 * the entire workstream feature surface: hero, four-step quick start, a
 * ten-section accordion, and a footer CTA linking to peer guides.
 *
 * The page was decomposed from a 1.95K-line monolith. This file is the
 * thin composer; section content lives in `./sections/<Name>.tsx` and
 * shared sub-components live alongside in this directory.
 */

import { Link } from "react-router-dom";
import * as Accordion from "@radix-ui/react-accordion";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Compass,
  Download,
  FolderOpen,
  Plus,
  Search,
  Sparkles,
  Star,
} from "lucide-react";

import { GuideFigure } from "@/components/GuideFigure";
import { QuickStartCard } from "./QuickStartCard";
import type { QuickStartStep } from "./types";
import { WhatAreWorkstreams } from "./sections/WhatAreWorkstreams";
import { CreatingWorkstream } from "./sections/CreatingWorkstream";
import { KanbanBoard } from "./sections/KanbanBoard";
import { PopulatingWorkstream } from "./sections/PopulatingWorkstream";
import { DeepResearch } from "./sections/DeepResearch";
import { ExecutiveBriefs } from "./sections/ExecutiveBriefs";
import { ExportingPresentations } from "./sections/ExportingPresentations";
import { ScanningAutoScan } from "./sections/ScanningAutoScan";
import { WorkflowIntegration } from "./sections/WorkflowIntegration";
import { TipsAdvancedUsage } from "./sections/TipsAdvancedUsage";

const QUICK_START_STEPS: QuickStartStep[] = [
  {
    step: 1,
    title: "Create Workstream",
    icon: <Plus className="h-5 w-5" />,
    description: "Define your research focus",
    details:
      "Name your workstream, write a description, select strategic pillars and goals, pick maturity stages and time horizons, and add keywords. These filters determine which signals are relevant to your research stream.",
  },
  {
    step: 2,
    title: "Populate",
    icon: <Sparkles className="h-5 w-5" />,
    description: "Add signals automatically or manually",
    details:
      "Use Auto-Populate for AI-matched signals from the existing database, run a Workstream Scan to discover fresh content from the web, or manually add signals from the Discover page. Signals land in your Inbox column.",
  },
  {
    step: 3,
    title: "Research",
    icon: <Search className="h-5 w-5" />,
    description: "Investigate with AI-powered tools",
    details:
      "Accept a signal to move it into Working, then run a Quick Update for a fast read or a Deep Dive for a comprehensive research package. The AI pulls from 5 to 15+ sources. Add your own notes and context as you go.",
  },
  {
    step: 4,
    title: "Export",
    icon: <Download className="h-5 w-5" />,
    description: "Generate briefs and presentations",
    details:
      "Generate AI executive briefs, preview and iterate with version history, then export as PDF documents or PowerPoint presentations with City of Austin branding. Use Bulk Export to create portfolio documents combining multiple briefs.",
  },
];

export default function GuideWorkstreams() {
  return (
    <>
      {/* Print styles */}
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
        {/* ================================================================ */}
        {/* Hero Header */}
        {/* ================================================================ */}
        <div className="bg-gradient-to-r from-brand-blue via-brand-blue/90 to-brand-green">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <Link
              to="/workstreams"
              className="no-print inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Workstreams
            </Link>
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex w-12 h-12 rounded-xl bg-white/15 items-center justify-center flex-shrink-0">
                <FolderOpen className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                  How to Use Workstreams
                </h1>
                <p className="mt-3 text-lg text-white/80 max-w-2xl leading-relaxed">
                  Workstreams transform raw signals into structured research and
                  leadership-ready deliverables. This guide walks you through
                  every capability -- from creating your first workstream to
                  exporting polished executive presentations.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <GuideFigure
            src="/guide/workstreams-kanban-board.png"
            alt="A workstream Kanban board with four columns — Inbox, Working, Ready, and Archived — holding signal cards, with a brief-backed card in the Ready column."
            caption="A workstream's Kanban board — signals flow from Inbox to Working, Ready, and Archived as you research them and prepare deliverables."
            className="mt-0 mb-12"
          />

          {/* ================================================================ */}
          {/* Quick Start (always visible) */}
          {/* ================================================================ */}
          <section className="mb-12">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Quick Start
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              The four-step workflow from signal discovery to stakeholder
              presentation. Click any step to learn more.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {QUICK_START_STEPS.map((step) => (
                <QuickStartCard key={step.step} data={step} />
              ))}
            </div>
          </section>

          {/* ================================================================ */}
          {/* Accordion Sections */}
          {/* ================================================================ */}
          <Accordion.Root
            type="multiple"
            defaultValue={[]}
            className="divide-y divide-gray-200 dark:divide-gray-700 border-t border-b border-gray-200 dark:border-gray-700"
          >
            <WhatAreWorkstreams />
            <CreatingWorkstream />
            <KanbanBoard />
            <PopulatingWorkstream />
            <DeepResearch />
            <ExecutiveBriefs />
            <ExportingPresentations />
            <ScanningAutoScan />
            <WorkflowIntegration />
            <TipsAdvancedUsage />
          </Accordion.Root>

          {/* ================================================================ */}
          {/* Footer CTA */}
          {/* ================================================================ */}
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
                  to="/guide/signals"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-brand-blue/30"
                >
                  <Star className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      How to Use Signals
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Manage your followed signals
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </Link>
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

          {/* Footer note */}
          <p className="mt-10 text-sm text-gray-400 dark:text-gray-500 text-center no-print">
            Questions about workstreams? Reach out to the Foresight team.
          </p>
        </div>
      </div>
    </>
  );
}
