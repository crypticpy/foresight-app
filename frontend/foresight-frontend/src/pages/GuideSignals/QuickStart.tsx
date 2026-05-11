/**
 * Always-visible Quick Start row — four click-to-expand cards that link to
 * the relevant page after explaining each step. Owns the active-step state
 * because it spans four sibling cards plus a shared expanded-detail panel.
 *
 * @module pages/GuideSignals/QuickStart
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Compass, Eye, Settings } from "lucide-react";
import type { ElementType } from "react";
import { cn } from "../../lib/utils";

interface QuickStartStep {
  number: number;
  title: string;
  subtitle: string;
  icon: ElementType;
  detail: string;
  linkText: string;
  linkTo: string;
}

const QUICK_START_STEPS: QuickStartStep[] = [
  {
    number: 1,
    title: "Discover",
    subtitle: "Find emerging trends",
    icon: Compass,
    detail:
      "Browse the Discover page to explore AI-curated signals across all strategic pillars. The system continuously scans hundreds of sources to surface relevant trends, technologies, and issues for Austin.",
    linkText: "Go to Discover",
    linkTo: "/discover",
  },
  {
    number: 2,
    title: "Follow",
    subtitle: "Track what matters",
    icon: Eye,
    detail:
      "When you find a signal that matters to your work, follow it. Following adds the signal to your personal hub so you receive updates when new sources or analysis become available.",
    linkText: "Browse signals",
    linkTo: "/discover",
  },
  {
    number: 3,
    title: "Manage",
    subtitle: "Organize your signals",
    icon: Settings,
    detail:
      "Use filters, sorting, grouping, and pin/star to organize your signal collection. Group by pillar, horizon, or workstream to see patterns. Pin your highest-priority signals so they always appear first.",
    linkText: "View My Signals",
    linkTo: "/signals",
  },
  {
    number: 4,
    title: "Research",
    subtitle: "Go deeper",
    icon: BookOpen,
    detail:
      "Add signals to workstreams for structured research. The system runs deep research using AI to gather comprehensive analysis, then you can generate executive briefs for stakeholder communication.",
    linkText: "View Workstreams",
    linkTo: "/workstreams",
  },
];

export function QuickStart() {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Quick Start
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Four steps from discovery to action. Click each step to learn more.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {QUICK_START_STEPS.map((step) => {
          const Icon = step.icon;
          const isActive = activeStep === step.number;

          return (
            <button
              key={step.number}
              type="button"
              onClick={() => setActiveStep(isActive ? null : step.number)}
              className={cn(
                "relative text-left rounded-xl border p-5 transition-all duration-200 print:break-inside-avoid",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                isActive
                  ? "bg-brand-blue/10 dark:bg-brand-blue/20 border-brand-blue dark:border-brand-blue/60 shadow-md -translate-y-1"
                  : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-700 hover:border-brand-blue/40 hover:shadow-sm",
              )}
            >
              <div
                className={cn(
                  "absolute -top-2.5 -left-2.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                  isActive
                    ? "bg-brand-blue text-white"
                    : "bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300",
                )}
              >
                {step.number}
              </div>

              <div
                className={cn(
                  "inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3",
                  isActive
                    ? "bg-brand-blue/20 text-brand-blue dark:text-brand-light-blue"
                    : "bg-gray-100 dark:bg-dark-surface-elevated text-gray-500 dark:text-gray-400",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>

              <h3
                className={cn(
                  "font-semibold mb-0.5",
                  isActive
                    ? "text-brand-blue dark:text-brand-light-blue"
                    : "text-gray-900 dark:text-white",
                )}
              >
                {step.title}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {step.subtitle}
              </p>
            </button>
          );
        })}
      </div>

      {activeStep !== null && (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-blue/20 dark:border-brand-blue/30 p-5 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          {(() => {
            const step = QUICK_START_STEPS.find((s) => s.number === activeStep);
            if (!step) return null;
            const Icon = step.icon;
            return (
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-brand-blue/10 dark:bg-brand-blue/20 shrink-0">
                  <Icon className="h-6 w-6 text-brand-blue dark:text-brand-light-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                    Step {step.number}: {step.title}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
                    {step.detail}
                  </p>
                  <Link
                    to={step.linkTo}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue dark:text-brand-light-blue hover:underline"
                  >
                    {step.linkText}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
