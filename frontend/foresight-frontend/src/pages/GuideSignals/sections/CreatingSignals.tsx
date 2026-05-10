/**
 * Accordion section 3/7 — the three-step signal creation wizard: define,
 * source preferences, review & create.
 *
 * @module pages/GuideSignals/sections/CreatingSignals
 */

import { Fragment } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { BookOpen, PenTool, Plus, Search, Zap } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

const WIZARD_STEPS = [
  { num: 1, label: "Define Signal" },
  { num: 2, label: "Source Preferences" },
  { num: 3, label: "Review & Create" },
];

export function CreatingSignals() {
  return (
    <Accordion.Item value="creating-signals" id="creating-signals">
      <AccordionTrigger icon={<Plus className="h-5 w-5" />}>
        Creating Signals
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          In addition to following signals from the Discover page, you can
          create new signals for topics not yet covered by the automated
          discovery pipeline. Click the{" "}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            New Signal
          </span>{" "}
          button on the Signals page to open the creation wizard.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          The 3-Step Wizard
        </h4>

        <div className="flex items-center gap-2 mb-5">
          {WIZARD_STEPS.map((s, i) => (
            <Fragment key={s.num}>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-semibold">
                  {s.num}
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
                  {s.label}
                </span>
              </div>
              {i < WIZARD_STEPS.length - 1 && (
                <div className="flex-1 h-0.5 bg-brand-blue/30 dark:bg-brand-blue/50 rounded-full" />
              )}
            </Fragment>
          ))}
        </div>

        <div className="mb-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-blue/10 text-brand-blue dark:text-brand-light-blue text-xs font-bold">
              1
            </span>
            Define Signal
          </h4>
          <p className="text-sm mb-3">Choose between two creation modes:</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-dark-surface">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-brand-blue" />
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  Quick Create
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Enter a topic phrase (e.g., &ldquo;AI-powered traffic signal
                optimization&rdquo;) and the system generates the full signal
                using AI analysis. Optionally assign to a workstream and get
                AI-suggested keywords.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-dark-surface">
              <div className="flex items-center gap-2 mb-2">
                <PenTool className="h-4 w-4 text-brand-blue" />
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  Manual Create
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Full control over signal name, description, strategic pillar(s),
                horizon, maturity stage, and seed URLs. Use this when you have
                specific classifications in mind.
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            In Quick Create mode, click{" "}
            <span className="font-medium text-gray-800 dark:text-gray-200">
              Suggest Keywords
            </span>{" "}
            to have AI generate relevant monitoring terms based on your topic
            phrase. You can add or remove keywords before proceeding.
          </p>
        </div>

        <div className="mb-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-blue/10 text-brand-blue dark:text-brand-light-blue text-xs font-bold">
              2
            </span>
            Source Preferences
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure which source categories to search, set a preferred content
            type, add priority domains, custom RSS feeds, and keywords for
            ongoing monitoring. See the{" "}
            <span className="font-medium text-gray-800 dark:text-gray-200">
              Source Preferences
            </span>{" "}
            section below for a detailed breakdown of each option.
          </p>
        </div>

        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-blue/10 text-brand-blue dark:text-brand-light-blue text-xs font-bold">
              3
            </span>
            Review & Create
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Review your configuration and choose a research depth:
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface">
              <Search className="h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Quick Scan
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ~5 sources, faster results
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface">
              <BookOpen className="h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Deep Dive
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ~15 sources, comprehensive analysis
                </p>
              </div>
            </div>
          </div>
        </div>

        <ProTip>
          Quick Create with a deep dive is the fastest way to generate a
          comprehensive signal. Start with a clear, specific topic phrase for
          best results &mdash; for example, &ldquo;autonomous shuttle pilots in
          mid-size cities&rdquo; rather than just &ldquo;autonomous
          vehicles.&rdquo;
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
