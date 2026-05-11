/**
 * Accordion section 9/10 — places workstreams within the broader Foresight
 * pipeline (Dashboard → Discover → Signals → Workstream → Export) and
 * outlines how features connect.
 *
 * @module pages/GuideWorkstreams/sections/WorkflowIntegration
 */

import React from "react";
import * as Accordion from "@radix-ui/react-accordion";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  Download,
  FolderOpen,
  GitBranch,
  Search,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function WorkflowIntegration() {
  return (
    <Accordion.Item value="workflow" id="workflow">
      <AccordionTrigger icon={<GitBranch className="h-5 w-5" />}>
        Workflow Integration
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Workstreams are one part of the complete Foresight pipeline.
          Understanding how they connect to other features helps you get the
          most value from the system.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          The Full Pipeline
        </h4>
        <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-0 mb-6">
          {[
            {
              label: "Dashboard",
              desc: "Overview & metrics",
              icon: <BarChart3 className="h-4 w-4" />,
            },
            {
              label: "Discover",
              desc: "Browse all signals",
              icon: <Search className="h-4 w-4" />,
            },
            {
              label: "Signals",
              desc: "Follow & track",
              icon: <BookOpen className="h-4 w-4" />,
            },
            {
              label: "Workstream",
              desc: "Research & brief",
              icon: <FolderOpen className="h-4 w-4" />,
            },
            {
              label: "Export",
              desc: "Present & act",
              icon: <Download className="h-4 w-4" />,
            },
          ].map((s, idx) => (
            <React.Fragment key={s.label}>
              <div
                className={cn(
                  "flex-1 rounded-lg border p-3 text-center",
                  s.label === "Workstream"
                    ? "border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/10"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface",
                )}
              >
                <div
                  className={cn(
                    "mx-auto mb-1.5",
                    s.label === "Workstream"
                      ? "text-brand-blue dark:text-brand-light-blue"
                      : "text-gray-500 dark:text-gray-400",
                  )}
                >
                  {s.icon}
                </div>
                <div
                  className={cn(
                    "text-xs font-semibold",
                    s.label === "Workstream"
                      ? "text-brand-blue dark:text-brand-light-blue"
                      : "text-gray-900 dark:text-white",
                  )}
                >
                  {s.label}
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {s.desc}
                </div>
              </div>
              {idx < 4 && (
                <div className="flex items-center justify-center sm:px-1">
                  <ArrowRight className="h-4 w-4 text-gray-400 hidden sm:block" />
                  <ChevronDown className="h-4 w-4 text-gray-400 sm:hidden" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          How Features Connect
        </h4>
        <ul className="list-disc list-inside space-y-2 mb-4">
          <li>
            <strong>Dashboard to Workstream:</strong> Spot a trend on the
            dashboard, then create a dedicated workstream to investigate it.
          </li>
          <li>
            <strong>Discover to Workstream:</strong> Find a compelling signal on
            the Discover page and add it directly to a workstream for structured
            research.
          </li>
          <li>
            <strong>Signals to Workstream:</strong> Signals you follow can be
            added to workstreams when they warrant deeper investigation beyond
            passive monitoring.
          </li>
          <li>
            <strong>Workstream to Action:</strong> Export briefs and portfolios
            to inform policy decisions, budget requests, and strategic planning.
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Team Collaboration
        </h4>
        <p>
          While workstreams are currently personal to each user, exported PDFs
          and presentations can be shared across teams. A common pattern is for
          one analyst to build a workstream, conduct research, and export a
          brief portfolio that becomes the basis for a team discussion or
          council presentation.
        </p>
      </AccordionContent>
    </Accordion.Item>
  );
}
