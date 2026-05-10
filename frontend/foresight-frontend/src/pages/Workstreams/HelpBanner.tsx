/**
 * Onboarding help banner shown above the workstream list. Persists its
 * dismissed state in localStorage under `BANNER_DISMISSED_KEY` (the composer
 * reads/writes the same key when the user clicks the help icon to restore
 * the banner).
 *
 * @module pages/Workstreams/HelpBanner
 */

import { useState } from "react";
import {
  Archive,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Inbox,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

export const BANNER_DISMISSED_KEY = "workstream-banner-dismissed";

interface HelpBannerProps {
  onDismiss: () => void;
}

const KANBAN_COLUMNS = [
  {
    name: "Inbox",
    icon: Inbox,
    color: "bg-blue-100 dark:bg-blue-900/30",
    description: "New signals awaiting triage",
  },
  {
    name: "Working",
    icon: Search,
    color: "bg-purple-100 dark:bg-purple-900/30",
    description: "Active investigation",
  },
  {
    name: "Ready",
    icon: FileText,
    color: "bg-green-100 dark:bg-green-900/30",
    description: "Shareable artifact exists",
  },
  {
    name: "Archived",
    icon: Archive,
    color: "bg-gray-100 dark:bg-gray-800/50",
    description: "Completed or dismissed",
  },
] as const;

export function HelpBanner({ onDismiss }: HelpBannerProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
      <div className="bg-gradient-to-r from-brand-blue to-brand-green h-1 rounded-t-lg" />

      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Workstreams are personalized research workspaces. Define filter
              criteria to automatically collect and track relevant signals
              through a structured research workflow.
            </p>
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-brand-blue hover:text-brand-dark-blue dark:text-brand-light-blue dark:hover:text-white transition-colors"
            >
              {expanded ? "Show less" : "Learn more"}
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors flex-shrink-0"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {expanded && (
          <div className="mt-5 space-y-6 border-t border-gray-200 dark:border-gray-700 pt-5">
            <Intro />
            <CreationGuide />
            <KanbanWorkflow />
            <Features />
            <GetStartedCta onDismiss={() => setExpanded(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="bg-brand-light-blue/30 dark:bg-brand-blue/10 rounded-lg p-4 border border-brand-blue/20">
      <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">
        A{" "}
        <strong className="text-brand-dark-blue dark:text-brand-light-blue">
          Workstream
        </strong>{" "}
        is a personalized research workspace that helps you organize and track
        intelligence signals relevant to a specific focus area. Think of it as a
        customized feed combined with a Kanban board for topics you care about.
      </p>
    </div>
  );
}

function CreationGuide() {
  const criteria = [
    "Strategic Pillars & Goals",
    "Maturity Stages (1-8)",
    "Time Horizon (H1, H2, H3)",
    "Keywords",
  ];
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4 text-brand-blue" />
        Creating a Workstream
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-gray-50 dark:bg-dark-surface/50 rounded-lg p-3">
          <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
            1. Define Your Focus
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Give your workstream a name like &quot;Smart Mobility
            Initiatives&quot; or &quot;Climate Resilience Tech&quot;
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-dark-surface/50 rounded-lg p-3">
          <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
            2. Set Filter Criteria
          </h4>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            {criteria.map((c) => (
              <li key={c} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-blue" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function KanbanWorkflow() {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-brand-blue" />
        Research Workflow
      </h3>
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
        Signals in your workstream flow through a Kanban board as you research
        them:
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {KANBAN_COLUMNS.map((col, idx) => (
          <div key={col.name} className="relative">
            <div className={cn("rounded-lg p-3 text-center", col.color)}>
              <col.icon className="h-4 w-4 mx-auto mb-1 text-gray-600 dark:text-gray-300" />
              <div className="text-xs font-medium text-gray-900 dark:text-white">
                {col.name}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-tight">
                {col.description}
              </div>
            </div>
            {idx < KANBAN_COLUMNS.length - 1 && (
              <ArrowRight className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 z-10" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Features() {
  const features = [
    {
      icon: Sparkles,
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
      title: "Auto-Populate",
      description:
        "AI finds and adds matching signals to your inbox automatically",
    },
    {
      icon: Search,
      iconBg: "bg-purple-100 dark:bg-purple-900/30",
      iconColor: "text-purple-600 dark:text-purple-400",
      title: "Deep Dive Research",
      description: "Trigger comprehensive AI analysis on any signal",
    },
    {
      icon: FileText,
      iconBg: "bg-green-100 dark:bg-green-900/30",
      iconColor: "text-green-600 dark:text-green-400",
      title: "Executive Briefs",
      description: "Generate leadership-ready summaries with version history",
    },
    {
      icon: ClipboardList,
      iconBg: "bg-orange-100 dark:bg-orange-900/30",
      iconColor: "text-orange-600 dark:text-orange-400",
      title: "Notes & Reminders",
      description: "Add context-specific notes and set follow-up reminders",
    },
  ];
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-blue" />
        What You Can Do
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {features.map((feat) => (
          <div
            key={feat.title}
            className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className={cn("p-1.5 rounded-lg", feat.iconBg)}>
              <feat.icon className={cn("h-3.5 w-3.5", feat.iconColor)} />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white text-xs">
                {feat.title}
              </h4>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {feat.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GetStartedCta({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-gradient-to-r from-brand-blue/10 to-brand-green/10 rounded-lg p-4 border border-brand-blue/20">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
            Ready to get started?
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Create your first workstream to begin organizing your research.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="inline-flex items-center px-3 py-1.5 bg-brand-blue text-white text-xs font-medium rounded-lg hover:bg-brand-dark-blue transition-colors"
        >
          Got it
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </button>
      </div>
    </div>
  );
}
