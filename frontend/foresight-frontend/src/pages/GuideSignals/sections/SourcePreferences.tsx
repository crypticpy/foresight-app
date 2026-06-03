/**
 * Accordion section 4/9 — source-category explorer (with active-source local
 * state) plus the additional priority-domain / RSS / keyword configuration.
 *
 * @module pages/GuideSignals/sections/SourcePreferences
 */

import { useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import type { ElementType } from "react";
import {
  ChevronDown,
  Cpu,
  Globe,
  GraduationCap,
  Landmark,
  Newspaper,
  Rss,
  Sparkles,
  Tag,
} from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { cn } from "../../../lib/utils";
import { AccordionTrigger, AccordionContent } from "../_accordion";

interface SourceCategory {
  id: string;
  label: string;
  icon: ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  examples: string[];
  bestFor: string;
}

const SOURCE_CATEGORIES: SourceCategory[] = [
  {
    id: "news",
    label: "News",
    icon: Newspaper,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    borderColor: "border-blue-200 dark:border-blue-700/50",
    description:
      "Real-time coverage from major wire services and specialized government/technology publications. Provides the broadest and most timely view of emerging topics.",
    examples: ["Reuters", "AP News", "GCN", "GovTech", "StateScoop"],
    bestFor:
      "Tracking breaking developments, policy announcements, and industry-wide trends as they unfold.",
  },
  {
    id: "academic",
    label: "Academic",
    icon: GraduationCap,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    borderColor: "border-purple-200 dark:border-purple-700/50",
    description:
      "Peer-reviewed research papers and preprints from academic databases. Delivers deep, evidence-based analysis with high source authority scores.",
    examples: ["arXiv (AI, ML, Computers & Society)", "Research databases"],
    bestFor:
      "Grounding signals in rigorous evidence, especially for technology feasibility and long-range horizon scanning.",
  },
  {
    id: "government",
    label: "Government",
    icon: Landmark,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    borderColor: "border-emerald-200 dark:border-emerald-700/50",
    description:
      "Federal agency publications, standards, and reports from .gov domains. These sources carry the highest municipal-specificity scores in the quality index.",
    examples: ["GSA", "NIST", "Census Bureau", "HUD", "DOT", "EPA", "FCC"],
    bestFor:
      "Regulatory changes, federal funding opportunities, compliance requirements, and government technology standards.",
  },
  {
    id: "tech_blog",
    label: "Tech Blogs",
    icon: Cpu,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
    borderColor: "border-orange-200 dark:border-orange-700/50",
    description:
      "Technology media and industry analysis from leading publications. Offers accessible explanations of complex technologies and adoption trends.",
    examples: ["TechCrunch", "Ars Technica", "Wired", "The Verge"],
    bestFor:
      "Early-stage technology scouting, understanding vendor landscapes, and tracking innovation velocity.",
  },
  {
    id: "rss",
    label: "Custom RSS",
    icon: Rss,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
    borderColor: "border-amber-200 dark:border-amber-700/50",
    description:
      "Your own curated RSS feeds for specialized or niche publications not covered by the default categories. Fully customizable during signal creation.",
    examples: [
      "Municipal blogs",
      "Niche industry feeds",
      "Internal newsletters",
    ],
    bestFor:
      "Monitoring hyper-specific domains, local government blogs, or specialized industry verticals.",
  },
];

const EXTRA_CONFIG = [
  {
    icon: Globe,
    title: "Priority Domains",
    desc: "Specify domains (e.g., gartner.com, mckinsey.com) to weight higher in results. Content from these domains is boosted during triage.",
  },
  {
    icon: Rss,
    title: "Custom RSS Feeds",
    desc: "Add RSS feed URLs for specialized or niche publications. These are fetched alongside the built-in source categories.",
  },
  {
    icon: Tag,
    title: "Keywords",
    desc: "Define monitoring keywords that the system uses to filter and rank incoming content for relevance to your signal.",
  },
];

export function SourcePreferences() {
  const [activeSource, setActiveSource] = useState<string | null>(null);

  return (
    <Accordion.Item value="source-preferences" id="source-preferences">
      <AccordionTrigger icon={<Sparkles className="h-5 w-5" />}>
        Source Preferences
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Source preferences determine where Foresight looks for information
          about your signal. Configuring these thoughtfully improves both the
          relevance and quality of the intelligence gathered. Click each
          category below to explore its details.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Source Categories
        </h4>
        <div className="space-y-2 mb-5">
          {SOURCE_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeSource === cat.id;

            return (
              <div key={cat.id}>
                <button
                  type="button"
                  onClick={() => setActiveSource(isActive ? null : cat.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                    isActive
                      ? cn(cat.bgColor, cat.borderColor, "shadow-sm")
                      : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
                      isActive
                        ? cn(cat.bgColor)
                        : "bg-gray-100 dark:bg-dark-surface-elevated",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        isActive
                          ? cat.color
                          : "text-gray-500 dark:text-gray-400",
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isActive
                          ? cat.color
                          : "text-gray-900 dark:text-gray-100",
                      )}
                    >
                      {cat.label}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
                      isActive && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>

                {isActive && (
                  <div
                    className={cn(
                      "mt-1 ml-12 mr-2 px-4 py-3 rounded-lg border text-sm animate-in fade-in-0 slide-in-from-top-1 duration-200",
                      cat.bgColor,
                      cat.borderColor,
                    )}
                  >
                    <p className="text-gray-700 dark:text-gray-300 mb-3">
                      {cat.description}
                    </p>
                    <div className="mb-3">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Example Sources
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {cat.examples.map((ex) => (
                          <span
                            key={ex}
                            className="inline-flex px-2 py-0.5 rounded-full bg-white/70 dark:bg-white/10 border border-gray-200/50 dark:border-gray-600/50 text-xs text-gray-700 dark:text-gray-300"
                          >
                            {ex}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Best For
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        {cat.bestFor}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Additional Configuration
        </h4>
        <div className="space-y-3 mb-4">
          {EXTRA_CONFIG.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex items-start gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface"
              >
                <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {item.title}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <ProTip defaultOpen>
          Enable at least two source categories for better corroboration scores.
          Signals with diverse sources score significantly higher on the Signal
          Quality Index than those relying on a single category.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
