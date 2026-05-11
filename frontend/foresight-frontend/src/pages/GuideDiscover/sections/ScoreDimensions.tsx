/**
 * Accordion section 7/9 — interactive six-dimension scoring explorer plus
 * the SQI composite tier bars.
 *
 * @module pages/GuideDiscover/sections/ScoreDimensions
 */

import { useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import {
  BarChart3,
  ChevronDown,
  CircleDot,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { cn } from "@/lib/utils";
import { AccordionTrigger, AccordionContent } from "../_accordion";

const SCORE_DIMENSIONS = [
  {
    name: "Impact",
    icon: <Target className="h-5 w-5" />,
    color: "text-red-500 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-900/20",
    borderColor: "border-red-200 dark:border-red-800/40",
    description:
      "How significantly could this trend affect City of Austin operations, services, or residents? High scores indicate potential to reshape how departments function or deliver services.",
    example:
      "A new federal mandate on municipal cybersecurity requirements might score 85+.",
  },
  {
    name: "Relevance",
    icon: <CircleDot className="h-5 w-5" />,
    color: "text-brand-blue dark:text-brand-light-blue",
    bgColor: "bg-brand-light-blue/30 dark:bg-brand-blue/10",
    borderColor: "border-brand-blue/20 dark:border-brand-blue/30",
    description:
      "How closely does this signal align with Austin's strategic pillars and the CMO's Top 25 Priorities? Higher relevance means direct connection to ongoing city initiatives.",
    example:
      "A transit innovation in a similarly-sized city would score higher than one from a rural context.",
  },
  {
    name: "Velocity",
    icon: <Zap className="h-5 w-5" />,
    color: "text-amber-500 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
    borderColor: "border-amber-200 dark:border-amber-800/40",
    description:
      "How quickly is this trend accelerating or changing? Fast-moving signals require more urgent attention. Consider adoption rates, funding momentum, and regulatory timelines.",
    example:
      "Rapidly spreading legislation across states would score high on velocity.",
  },
  {
    name: "Novelty",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-purple-500 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    borderColor: "border-purple-200 dark:border-purple-800/40",
    description:
      "How new or emerging is this signal? Novel topics represent genuinely new information that is not yet widely known or discussed in municipal circles.",
    example:
      "A first-of-its-kind pilot program would score higher than an incremental update to existing policy.",
  },
  {
    name: "Opportunity",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "text-brand-green dark:text-brand-green",
    bgColor: "bg-brand-light-green/30 dark:bg-brand-green/10",
    borderColor: "border-brand-green/20 dark:border-brand-green/30",
    description:
      "What is the potential for positive action? Signals with high opportunity scores suggest areas where the city could gain an advantage, secure funding, or improve outcomes by acting early.",
    example:
      "A new federal grant program for smart city infrastructure would score high.",
  },
  {
    name: "Risk",
    icon: <Shield className="h-5 w-5" />,
    color: "text-orange-500 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
    borderColor: "border-orange-200 dark:border-orange-800/40",
    description:
      "What are the threats if this signal is ignored? High-risk scores indicate that inaction could lead to negative consequences -- regulatory penalties, missed deadlines, security vulnerabilities, or loss of public trust.",
    example:
      "An emerging cybersecurity vulnerability affecting municipal systems would score high.",
  },
];

const SQI_TIERS = [
  { range: "70-100", tier: "High", color: "bg-brand-green", width: "85%" },
  {
    range: "40-69",
    tier: "Moderate",
    color: "bg-extended-orange",
    width: "55%",
  },
  {
    range: "0-39",
    tier: "Needs Verification",
    color: "bg-extended-red",
    width: "25%",
  },
];

export function ScoreDimensions() {
  const [expandedScore, setExpandedScore] = useState<string | null>(null);

  return (
    <Accordion.Item value="scores" id="scores">
      <AccordionTrigger icon={<BarChart3 className="h-5 w-5" />}>
        Understanding Score Dimensions
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Every signal receives six independent scores on a 0-100 scale. These
          scores are computed by AI analysis and combined into a composite
          Signal Quality Index (SQI). Click on any dimension below to learn what
          it measures and how it is calculated.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          {SCORE_DIMENSIONS.map((dim) => (
            <button
              key={dim.name}
              type="button"
              onClick={() =>
                setExpandedScore(expandedScore === dim.name ? null : dim.name)
              }
              className={cn(
                "rounded-lg border text-left transition-all duration-200",
                "hover:shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                expandedScore === dim.name
                  ? cn(dim.borderColor, dim.bgColor, "shadow-sm")
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface",
              )}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <span className={dim.color}>{dim.icon}</span>
                <span className="flex-1 font-semibold text-sm text-gray-900 dark:text-white">
                  {dim.name}
                </span>
                <span className="text-xs text-gray-400">0-100</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-gray-400 transition-transform duration-200",
                    expandedScore === dim.name && "rotate-180",
                  )}
                />
              </div>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-300",
                  expandedScore === dim.name
                    ? "max-h-48 opacity-100"
                    : "max-h-0 opacity-0",
                )}
              >
                <div className="px-4 pb-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  <p className="mb-2">{dim.description}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    Example: {dim.example}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Signal Quality Index (SQI)
        </h4>
        <p className="mb-3">
          The SQI is a composite score that considers source authority, source
          diversity, corroboration, recency, and municipal specificity. It
          provides a single quality indicator at a glance:
        </p>
        <div className="space-y-2 mb-4">
          {SQI_TIERS.map((s) => (
            <div key={s.tier} className="flex items-center gap-3 text-sm">
              <span className="w-16 text-right font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                {s.range}
              </span>
              <div className="flex-1 h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-200",
                    s.color,
                  )}
                  style={{ width: s.width }}
                />
              </div>
              <span className="text-gray-500 dark:text-gray-400 text-xs w-32">
                {s.tier}
              </span>
            </div>
          ))}
        </div>

        <ProTip>
          Use score threshold sliders in the filter panel to surface only
          signals above your minimum bar. Setting Impact above 60 and Relevance
          above 50 is a good starting point for focused analysis sessions.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
