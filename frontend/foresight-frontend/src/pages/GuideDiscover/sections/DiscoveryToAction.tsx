/**
 * Accordion section 9/9 — five-step workflow diagram (Discover → Follow →
 * My Signals → Workstream → Brief) with prose for each step.
 *
 * @module pages/GuideDiscover/sections/DiscoveryToAction
 */

import { Fragment } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Compass,
  ExternalLink,
  Layers,
  Star,
} from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { cn } from "@/lib/utils";
import { AccordionTrigger, AccordionContent } from "../_accordion";

const WORKFLOW_STEPS = [
  {
    step: "Discover",
    desc: "Find signals",
    icon: <Compass className="h-5 w-5" />,
    color: "border-brand-blue/40 bg-brand-light-blue/30 dark:bg-brand-blue/10",
    textColor: "text-brand-blue dark:text-brand-light-blue",
    active: true,
  },
  {
    step: "Follow",
    desc: "Build watchlist",
    icon: <Star className="h-5 w-5" />,
    color: "border-amber-300/40 bg-amber-50 dark:bg-amber-900/10",
    textColor: "text-amber-600 dark:text-amber-400",
    active: false,
  },
  {
    step: "My Signals",
    desc: "Organize & manage",
    icon: <BookOpen className="h-5 w-5" />,
    color: "border-purple-300/40 bg-purple-50 dark:bg-purple-900/10",
    textColor: "text-purple-600 dark:text-purple-400",
    active: false,
  },
  {
    step: "Workstream",
    desc: "Deep research",
    icon: <Layers className="h-5 w-5" />,
    color:
      "border-brand-green/40 bg-brand-light-green/30 dark:bg-brand-green/10",
    textColor: "text-brand-green dark:text-brand-green",
    active: false,
  },
  {
    step: "Brief",
    desc: "Act on insights",
    icon: <ExternalLink className="h-5 w-5" />,
    color: "border-red-300/40 bg-red-50 dark:bg-red-900/10",
    textColor: "text-red-500 dark:text-red-400",
    active: false,
  },
];

export function DiscoveryToAction() {
  return (
    <Accordion.Item value="workflow" id="workflow">
      <AccordionTrigger icon={<ArrowRight className="h-5 w-5" />}>
        From Discovery to Action
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-5">
          Discover is the starting point of a workflow that turns raw
          intelligence into strategic action. Here is how the pieces fit
          together:
        </p>

        <div className="flex flex-col sm:flex-row items-stretch gap-0 mb-6">
          {WORKFLOW_STEPS.map((item, idx, arr) => (
            <Fragment key={item.step}>
              <div
                className={cn(
                  "flex-1 rounded-lg border p-4 text-center",
                  item.color,
                  item.active && "ring-2 ring-brand-blue/30",
                )}
              >
                <div className={cn("mx-auto mb-1.5", item.textColor)}>
                  {item.icon}
                </div>
                <p
                  className={cn(
                    "font-semibold text-sm",
                    item.active
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-700 dark:text-gray-300",
                  )}
                >
                  {item.step}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {item.desc}
                </p>
              </div>
              {idx < arr.length - 1 && (
                <div className="flex items-center justify-center py-2 sm:py-0 sm:px-1">
                  <ArrowRight className="h-4 w-4 text-gray-400 rotate-90 sm:rotate-0" />
                </div>
              )}
            </Fragment>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              1. Discover
            </h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Browse the intelligence library, search for topics, and use
              filters to surface the most relevant signals for your area of
              responsibility. This is where you are now.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              2. Follow
            </h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              When you find a signal worth tracking, follow it. Following is
              lightweight and reversible -- think of it as adding a bookmark
              with intelligence updates.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              3. My Signals
            </h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Your{" "}
              <Link
                to="/signals"
                className="font-medium text-brand-blue dark:text-brand-light-blue hover:underline"
              >
                Signals page
              </Link>{" "}
              collects everything you follow. Review, prioritize, and decide
              which signals warrant deeper investigation.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              4. Workstream
            </h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Route high-priority signals into{" "}
              <Link
                to="/workstreams"
                className="font-medium text-brand-blue dark:text-brand-light-blue hover:underline"
              >
                Workstreams
              </Link>{" "}
              for structured deep research. Workstreams provide kanban boards,
              AI-assisted research, and team collaboration tools.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              5. Brief
            </h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Generate executive briefs from your research findings. Briefs
              synthesize signal intelligence into actionable summaries for
              decision-makers and leadership.
            </p>
          </div>
        </div>

        <ProTip title="Building an Effective Workflow">
          Start broad in Discover, narrow with filters, follow liberally in the
          early stages. Then use My Signals to periodically prune and prioritize
          before routing the most actionable signals into workstreams. This
          funnel approach ensures you do not miss weak signals while keeping
          your active research focused.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
