/**
 * GuideChat — long-form documentation page for the Ask Foresight AI
 * assistant: hero, four-step quick start, an eight-section accordion, and a
 * footer CTA linking to peer guides and the live Ask page.
 *
 * Follows the same thin-composer pattern as GuideWorkstreams: section
 * content lives in `./sections/<Name>.tsx` and shared sub-components live
 * alongside in this directory.
 */

import { Link } from "react-router-dom";
import * as Accordion from "@radix-ui/react-accordion";
import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  Globe,
  MessageSquare,
  Quote,
  Radio,
  Sparkles,
} from "lucide-react";

import { GuideFigure } from "@/components/GuideFigure";
import { useGuideAccordionHash } from "@/hooks/useGuideAccordionHash";
import { QuickStartCard } from "./QuickStartCard";
import type { QuickStartStep } from "./types";
import { WhatIsAskForesight } from "./sections/WhatIsAskForesight";
import { WhereToFindIt } from "./sections/WhereToFindIt";
import { ChoosingScope } from "./sections/ChoosingScope";
import { AskingGoodQuestions } from "./sections/AskingGoodQuestions";
import { UnderstandingAnswers } from "./sections/UnderstandingAnswers";
import { ConversationsHistory } from "./sections/ConversationsHistory";
import { HandyFeatures } from "./sections/HandyFeatures";
import { TipsAndLimits } from "./sections/TipsAndLimits";

const QUICK_START_STEPS: QuickStartStep[] = [
  {
    step: 1,
    title: "Open Ask",
    icon: <Sparkles className="h-5 w-5" />,
    description: "Find it in the navigation",
    details:
      "Click Ask in the top navigation (the sparkle icon) for the full-screen assistant, or open the chat on any signal or inside a workstream.",
  },
  {
    step: 2,
    title: "Pick a Scope",
    icon: <Globe className="h-5 w-5" />,
    description: "Aim the assistant",
    details:
      "Choose All Signals for broad questions or a workstream for focused ones. On a single signal, the scope is already set for you.",
  },
  {
    step: 3,
    title: "Ask in Plain English",
    icon: <MessageSquare className="h-5 w-5" />,
    description: "Type or speak your question",
    details:
      "No special syntax needed. Say what you want back -- a summary, the risks, talking points -- and add context. Tap the microphone to speak instead of typing.",
  },
  {
    step: 4,
    title: "Explore with Citations",
    icon: <Quote className="h-5 w-5" />,
    description: "Verify and follow up",
    details:
      "Open the citations to check the sources behind an answer, then ask follow-up questions. The assistant remembers the conversation as you refine.",
  },
];

// Accordion section values in render order. The first is open on load; any
// of these may be deep-linked via `/guide/chat#<value>`.
const ACCORDION_SECTIONS = [
  "what",
  "where",
  "scope",
  "questions",
  "answers",
  "conversations",
  "features",
  "tips",
];

export default function GuideChat() {
  const [openSections, setOpenSections] =
    useGuideAccordionHash(ACCORDION_SECTIONS);

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
              to="/ask"
              className="no-print inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Ask Foresight
            </Link>
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex w-12 h-12 rounded-xl bg-white/15 items-center justify-center flex-shrink-0">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                  How to Use Ask Foresight
                </h1>
                <p className="mt-3 text-lg text-white/80 max-w-2xl leading-relaxed">
                  Ask Foresight is your AI research assistant. Ask questions in
                  plain English and get answers grounded in your signals and
                  research -- with citations you can check. This guide shows you
                  how to get the most out of it.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <GuideFigure
            src="/guide/ask-foresight-chat.png"
            alt="The Ask Foresight assistant answering a question about mobility signals, with a structured summary, recommendation, and the conversation history in the left sidebar."
            caption="Ask Foresight answers in plain English — grounded in your signals, with citations to check and a running conversation history."
            className="mt-0 mb-12"
            eager
          />

          {/* ================================================================ */}
          {/* Quick Start (always visible) */}
          {/* ================================================================ */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Quick Start
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Four steps from question to answer. Click any step to learn more.
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
            value={openSections}
            onValueChange={setOpenSections}
            className="divide-y divide-gray-200 dark:divide-gray-700 border-t border-b border-gray-200 dark:border-gray-700"
          >
            <WhatIsAskForesight />
            <WhereToFindIt />
            <ChoosingScope />
            <AskingGoodQuestions />
            <UnderstandingAnswers />
            <ConversationsHistory />
            <HandyFeatures />
            <TipsAndLimits />
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
                Put Ask Foresight to work alongside the rest of the workflow.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <Link
                  to="/ask"
                  className="flex items-center gap-3 rounded-lg border border-brand-blue/30 bg-brand-blue/5 dark:bg-brand-blue/10 p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                >
                  <Sparkles className="h-5 w-5 text-brand-blue dark:text-brand-light-blue flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      Open Ask Foresight
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Start a conversation now
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </Link>
                <Link
                  to="/guide/workstreams"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-brand-blue/30"
                >
                  <FolderOpen className="h-5 w-5 text-brand-blue dark:text-brand-light-blue flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      How to Use Workstreams
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Turn signals into research
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </Link>
                <Link
                  to="/guide/signals"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-brand-blue/30"
                >
                  <Radio className="h-5 w-5 text-brand-blue dark:text-brand-light-blue flex-shrink-0" />
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
              </div>
            </div>
          </section>

          {/* Footer note */}
          <p className="mt-10 text-sm text-gray-400 dark:text-gray-500 text-center no-print">
            Questions about Ask Foresight? Reach out to the Foresight team.
          </p>
        </div>
      </div>
    </>
  );
}
