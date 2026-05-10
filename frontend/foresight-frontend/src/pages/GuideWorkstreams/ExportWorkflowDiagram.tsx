/**
 * Five-step horizontal flow showing how cards become exported PDFs/PPTXs.
 * Collapses to a vertical chevron stack on small screens.
 *
 * @module pages/GuideWorkstreams/ExportWorkflowDiagram
 */

import React from "react";
import {
  ArrowRight,
  Brain,
  ChevronDown,
  ClipboardList,
  Download,
  Eye,
  FileDown,
} from "lucide-react";
import { cn } from "../../lib/utils";

export function ExportWorkflowDiagram() {
  const steps = [
    {
      title: "Cards in Brief Column",
      subtitle: "Researched & ready",
      icon: <ClipboardList className="h-5 w-5" />,
      color:
        "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
    },
    {
      title: "Generate Brief",
      subtitle: "AI synthesis",
      icon: <Brain className="h-5 w-5" />,
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    },
    {
      title: "Review & Iterate",
      subtitle: "Preview modal",
      icon: <Eye className="h-5 w-5" />,
      color:
        "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
    },
    {
      title: "Choose Format",
      subtitle: "PDF or PPTX",
      icon: <FileDown className="h-5 w-5" />,
      color:
        "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    },
    {
      title: "Download",
      subtitle: "City of Austin branded",
      icon: <Download className="h-5 w-5" />,
      color:
        "bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue dark:text-brand-light-blue",
    },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-0">
      {steps.map((step, idx) => (
        <React.Fragment key={step.title}>
          <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-3 text-center">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2",
                step.color,
              )}
            >
              {step.icon}
            </div>
            <div className="text-xs font-semibold text-gray-900 dark:text-white">
              {step.title}
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              {step.subtitle}
            </div>
          </div>
          {idx < steps.length - 1 && (
            <div className="flex items-center justify-center sm:px-1">
              <ArrowRight className="h-4 w-4 text-gray-400 hidden sm:block" />
              <ChevronDown className="h-4 w-4 text-gray-400 sm:hidden" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
