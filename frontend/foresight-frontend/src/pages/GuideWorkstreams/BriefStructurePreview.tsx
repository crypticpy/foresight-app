/**
 * Click-to-expand list of the eight canonical sections that an AI-generated
 * executive brief contains. Used inside the "Executive Briefs" accordion
 * to give a tangible preview without requiring a real brief.
 *
 * @module pages/GuideWorkstreams/BriefStructurePreview
 */

import { useState } from "react";
import {
  BarChart3,
  ChevronDown,
  FileText,
  Layers,
  Settings,
  Shield,
  Star,
  Target,
  Telescope,
} from "lucide-react";
import { cn } from "../../lib/utils";

export function BriefStructurePreview() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const sections = [
    {
      id: "exec-summary",
      title: "Executive Summary",
      icon: <Star className="h-3.5 w-3.5" />,
      content:
        "A concise 2-3 paragraph overview highlighting the most important findings, immediate implications for the City of Austin, and recommended next steps. Written for leadership audiences who need the key takeaways quickly.",
    },
    {
      id: "current-state",
      title: "Current State of Technology / Trend",
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      content:
        "Analysis of the current landscape: where the technology or trend stands today, key metrics and adoption rates, maturity level, and how it compares to alternatives. Includes data from authoritative sources.",
    },
    {
      id: "municipal-apps",
      title: "Municipal Applications",
      icon: <Target className="h-3.5 w-3.5" />,
      content:
        "Specific use cases for the City of Austin. Maps the signal to city departments, operational areas, and strategic priorities. Includes examples from peer cities and government agencies.",
    },
    {
      id: "implementation",
      title: "Implementation Considerations",
      icon: <Settings className="h-3.5 w-3.5" />,
      content:
        "Practical guidance on what it would take to adopt or respond to this signal. Covers timelines, resource requirements, integration with existing systems, and change management considerations.",
    },
    {
      id: "vendors",
      title: "Key Vendors & Partners",
      icon: <Layers className="h-3.5 w-3.5" />,
      content:
        "Landscape of solution providers, technology vendors, academic partners, and consulting firms relevant to this topic. Includes public-sector-friendly options and cooperative purchasing references where applicable.",
    },
    {
      id: "costs",
      title: "Cost & Budget Implications",
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      content:
        "Estimated cost ranges, funding models (grants, bonds, shared services), ROI analysis, and total cost of ownership considerations. Calibrated for municipal budget constraints.",
    },
    {
      id: "risks",
      title: "Risks & Mitigation",
      icon: <Shield className="h-3.5 w-3.5" />,
      content:
        "Key risks including technical, political, legal, equity, and operational dimensions. Each risk is paired with a recommended mitigation strategy.",
    },
    {
      id: "future-outlook",
      title: "Future Outlook",
      icon: <Telescope className="h-3.5 w-3.5" />,
      content:
        "Where this signal is likely headed over the next 1, 3, and 5 years. Scenarios for different adoption trajectories and the implications for Austin if it acts early, on time, or late.",
    },
  ];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface overflow-hidden">
      <div className="bg-gradient-to-r from-brand-blue/10 to-brand-green/10 dark:from-brand-blue/20 dark:to-brand-green/20 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-blue dark:text-brand-light-blue" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Typical Executive Brief Structure
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Click any section to see what it contains
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
        {sections.map((section) => (
          <div key={section.id}>
            <button
              type="button"
              onClick={() =>
                setExpandedSection(
                  expandedSection === section.id ? null : section.id,
                )
              }
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                expandedSection === section.id
                  ? "bg-brand-blue/5 dark:bg-brand-blue/10"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700/30",
              )}
            >
              <span className="text-brand-blue dark:text-brand-light-blue">
                {section.icon}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">
                {section.title}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-gray-400 transition-transform duration-200",
                  expandedSection === section.id && "rotate-180",
                )}
              />
            </button>
            {expandedSection === section.id && (
              <div className="px-4 pb-3 pl-11">
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  {section.content}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
