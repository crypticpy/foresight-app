/**
 * Three static cards explaining the Question → Deep research → Polished
 * export pipeline that drives the brief generator.
 *
 * @module pages/HowItWorks/BriefIllustration
 */

import { BookOpen, FileText, Wand2 } from "lucide-react";
import { cn } from "../../lib/utils";

export function BriefIllustration() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[
        {
          icon: Wand2,
          title: "Question",
          desc: "An analyst asks a strategic question on a signal or workstream.",
          accent: "bg-brand-blue/10 text-brand-blue",
        },
        {
          icon: BookOpen,
          title: "Deep research",
          desc: "gpt-researcher orchestrates focused web research, collects citations, drafts a structured brief.",
          accent: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
        },
        {
          icon: FileText,
          title: "Polished export",
          desc: "Gamma generates a branded PowerPoint with AI-generated images and consistent themes — ready for the executive read-out.",
          accent: "bg-brand-green/10 text-brand-green",
        },
      ].map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.title}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-5"
          >
            <div className={cn("p-2 rounded-lg w-fit mb-3", s.accent)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="font-bold text-gray-900 dark:text-white mb-1">
              {s.title}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {s.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}
