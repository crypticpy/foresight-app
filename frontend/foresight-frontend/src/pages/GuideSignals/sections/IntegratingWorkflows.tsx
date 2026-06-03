/**
 * Accordion section 8/9 — Dashboard → Discover → Follow → My Signals →
 * Workstream → Research → Brief flow, with desktop and mobile diagrams.
 *
 * @module pages/GuideSignals/sections/IntegratingWorkflows
 */

import { Fragment } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import type { ElementType } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Compass,
  Eye,
  FileText,
  Layers,
  Radio,
} from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { cn } from "../../../lib/utils";
import { AccordionTrigger, AccordionContent } from "../_accordion";

interface FlowStep {
  label: string;
  sublabel: string;
  icon: ElementType;
  color: string;
}

const WORKFLOW_STEPS: FlowStep[] = [
  {
    label: "Dashboard",
    sublabel: "Overview",
    icon: BarChart3,
    color: "bg-indigo-500",
  },
  {
    label: "Discover",
    sublabel: "Browse signals",
    icon: Compass,
    color: "bg-blue-500",
  },
  {
    label: "Follow",
    sublabel: "Track signal",
    icon: Eye,
    color: "bg-cyan-500",
  },
  {
    label: "My Signals",
    sublabel: "Personal hub",
    icon: Radio,
    color: "bg-brand-blue",
  },
  {
    label: "Workstream",
    sublabel: "Organize",
    icon: Layers,
    color: "bg-violet-500",
  },
  {
    label: "Research",
    sublabel: "Deep dive",
    icon: BookOpen,
    color: "bg-emerald-500",
  },
  {
    label: "Brief",
    sublabel: "Share insights",
    icon: FileText,
    color: "bg-brand-green",
  },
];

export function IntegratingWorkflows() {
  return (
    <Accordion.Item value="workflows" id="workflows">
      <AccordionTrigger icon={<ArrowRight className="h-5 w-5" />}>
        Integrating with Workflows
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-5">
          Signals are designed to flow through a structured workflow from
          initial discovery to actionable intelligence. Here is how each stage
          connects:
        </p>

        <div className="mb-6">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Intelligence Workflow
          </h4>

          {/* Desktop: horizontal flow */}
          <div className="hidden lg:flex items-center gap-1 overflow-x-auto pb-2">
            {WORKFLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <Fragment key={step.label}>
                  <div className="flex flex-col items-center min-w-[90px]">
                    <div
                      className={cn(
                        "flex items-center justify-center w-12 h-12 rounded-xl text-white mb-2",
                        step.color,
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 text-center">
                      {step.label}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
                      {step.sublabel}
                    </span>
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0 mx-1" />
                  )}
                </Fragment>
              );
            })}
          </div>

          {/* Mobile/tablet: vertical flow */}
          <div className="lg:hidden space-y-0">
            {WORKFLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.label}>
                  <div className="flex items-center gap-3 py-2">
                    <div
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-lg text-white shrink-0",
                        step.color,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {step.label}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        {step.sublabel}
                      </span>
                    </div>
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className="flex justify-center py-1">
                      <div className="w-0.5 h-4 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Stage Details
        </h4>
        <ol className="list-decimal list-inside space-y-3 text-sm mb-4">
          <li>
            <span className="font-medium">Dashboard</span> &mdash; Your landing
            page shows aggregate metrics, recent activity, and top signals
            across all pillars.
          </li>
          <li>
            <span className="font-medium">Discover</span> &mdash; Browse the
            full catalog of AI-curated signals. Filter by pillar, horizon, and
            quality. Triage with bulk actions.
          </li>
          <li>
            <span className="font-medium">Follow</span> &mdash; Add promising
            signals to your personal hub with one click. This creates a
            persistent subscription to updates.
          </li>
          <li>
            <span className="font-medium">My Signals</span> &mdash; Your
            organized collection. Filter, sort, group, and pin to manage your
            intelligence portfolio.
          </li>
          <li>
            <span className="font-medium">Workstream</span> &mdash; Move signals
            into structured research workstreams. Use the kanban board to track
            progress through investigation stages.
          </li>
          <li>
            <span className="font-medium">Research</span> &mdash; Run AI-powered
            deep research tasks that gather 10-15+ sources and produce
            comprehensive analysis reports.
          </li>
          <li>
            <span className="font-medium">Brief</span> &mdash; Generate
            executive briefs from your researched signals for stakeholder
            communication. Export as PDF, PowerPoint, or CSV.
          </li>
        </ol>

        <ProTip defaultOpen>
          Not every signal needs to complete the full workflow. Some signals are
          valuable simply as &ldquo;watch items&rdquo; on your Signals page.
          Reserve deep research and briefing for signals that require active
          strategic response.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
