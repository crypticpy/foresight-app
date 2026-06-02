/**
 * Accordion section 9/9 — quality thresholds, horizon strategy, create vs
 * follow heuristics, naming conventions, and general best practices.
 *
 * @module pages/GuideSignals/sections/TipsBestPractices
 */

import * as Accordion from "@radix-ui/react-accordion";
import type { ElementType } from "react";
import {
  CheckCircle,
  Clock,
  Compass,
  Eye,
  Filter,
  Layers,
  Plus,
  Star,
} from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { cn } from "../../../lib/utils";
import { AccordionTrigger, AccordionContent } from "../_accordion";

const QUALITY_TIERS = [
  {
    range: "70-100",
    label: "High confidence",
    desc: "Well-sourced, corroborated intelligence suitable for strategic decisions and executive briefings.",
    color:
      "border-brand-green/30 bg-brand-light-green/20 dark:bg-brand-green/10",
  },
  {
    range: "40-69",
    label: "Moderate",
    desc: "Useful for monitoring and planning. Consider running additional research to strengthen the evidence base.",
    color: "border-amber-200/50 bg-amber-50/50 dark:bg-amber-900/10",
  },
  {
    range: "0-39",
    label: "Needs attention",
    desc: "Emerging or under-sourced signals. Good candidates for deep research tasks to gather more evidence.",
    color: "border-red-200/50 bg-red-50/30 dark:bg-red-900/10",
  },
];

interface GeneralTip {
  icon: ElementType;
  tip: string;
}

const GENERAL_TIPS: GeneralTip[] = [
  {
    icon: Clock,
    tip: "Review your signals weekly. Unfollow or archive signals that are no longer relevant to keep your hub focused.",
  },
  {
    icon: Layers,
    tip: "Add high-priority signals to workstreams early. Structured research yields better briefings than ad-hoc monitoring.",
  },
  {
    icon: Star,
    tip: "Pin no more than 5-7 signals at a time. If everything is a priority, nothing is. Reserve pins for your most active investigations.",
  },
  {
    icon: Filter,
    tip: "Save mental energy by using quality-score filtering. Set a minimum of 40 to reduce noise from under-sourced signals.",
  },
  {
    icon: Compass,
    tip: "Check the Discover page weekly for new signals. The AI continuously adds new intelligence that may be relevant to your work.",
  },
];

export function TipsBestPractices() {
  return (
    <Accordion.Item value="tips" id="tips">
      <AccordionTrigger icon={<CheckCircle className="h-5 w-5" />}>
        Tips and Best Practices
      </AccordionTrigger>
      <AccordionContent>
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Quality Thresholds
        </h4>
        <div className="space-y-2 mb-5">
          {QUALITY_TIERS.map((tier) => (
            <div
              key={tier.range}
              className={cn("rounded-lg border p-4", tier.color)}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                  SQI {tier.range}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {tier.label}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {tier.desc}
              </p>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Horizon Strategy
        </h4>
        <ul className="list-disc list-inside space-y-1.5 text-sm mb-5">
          <li>
            <span className="font-medium">H1 signals</span> need the most
            frequent attention. Review weekly and consider immediate workstream
            assignment for action planning.
          </li>
          <li>
            <span className="font-medium">H2 signals</span> benefit from
            periodic deep research. Review monthly to identify signals that are
            accelerating toward H1.
          </li>
          <li>
            <span className="font-medium">H3 signals</span> are strategic
            watches. Monitor quarterly and use the quality score trend to detect
            early acceleration.
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          When to Create vs. Follow
        </h4>
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          <div className="rounded-lg border border-brand-blue/20 bg-brand-light-blue/20 dark:bg-brand-blue/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="h-4 w-4 text-brand-blue" />
              <span className="text-sm font-semibold text-brand-blue dark:text-brand-light-blue">
                Follow a signal when:
              </span>
            </div>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>&bull; The topic already exists in Discover</li>
              <li>&bull; Existing sources and analysis are sufficient</li>
              <li>
                &bull; You want to track but not customize source preferences
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-brand-green/20 bg-brand-light-green/20 dark:bg-brand-green/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="h-4 w-4 text-brand-green" />
              <span className="text-sm font-semibold text-brand-compliant-green dark:text-brand-green">
                Create a signal when:
              </span>
            </div>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>&bull; The topic does not exist yet in the system</li>
              <li>&bull; You need specific source preferences or keywords</li>
              <li>&bull; You have seed URLs to bootstrap the analysis</li>
            </ul>
          </div>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Naming Conventions
        </h4>
        <ul className="list-disc list-inside space-y-1 text-sm mb-5">
          <li>
            Use specific, descriptive names: &ldquo;AI-Powered Traffic Signal
            Optimization&rdquo; not &ldquo;AI Traffic&rdquo;
          </li>
          <li>
            Include geographic scope when relevant: &ldquo;Modular Housing
            Pilots in Texas&rdquo;
          </li>
          <li>Avoid acronyms unless universally understood within your team</li>
          <li>
            For Quick Create, write topic phrases as you would describe the
            topic to a colleague
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          General Best Practices
        </h4>
        <div className="space-y-3 mb-4">
          {GENERAL_TIPS.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex items-start gap-3 text-sm">
                <Icon className="h-4 w-4 text-brand-blue dark:text-brand-light-blue shrink-0 mt-0.5" />
                <p className="text-gray-600 dark:text-gray-400">{item.tip}</p>
              </div>
            );
          })}
        </div>

        <ProTip defaultOpen>
          Combine horizon strategy with pillar grouping for the most effective
          scanning pattern. Group by pillar, then mentally scan each pillar
          across all three horizons. This ensures comprehensive coverage without
          missing emerging threats or opportunities in any strategic area.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
