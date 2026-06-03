/**
 * Accordion section 1/9 — defines what a signal is, the six strategic
 * pillars, three time horizons, and the SQI score.
 *
 * @module pages/GuideSignals/sections/WhatAreSignals
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Radio } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { GuideFigure } from "@/components/GuideFigure";
import { AccordionTrigger, AccordionContent } from "../_accordion";
import { SqiBar } from "../SqiBar";

const PILLARS = [
  { code: "CH", label: "Community Health" },
  { code: "MC", label: "Mobility" },
  { code: "HS", label: "Housing" },
  { code: "EC", label: "Economic" },
  { code: "ES", label: "Environmental" },
  { code: "CE", label: "Cultural" },
];

const HORIZONS = [
  {
    code: "H1",
    label: "Now (0-2 years)",
    desc: "Immediate or near-term impacts that require attention now.",
  },
  {
    code: "H2",
    label: "Near (2-5 years)",
    desc: "Medium-term trends that should inform planning and strategy.",
  },
  {
    code: "H3",
    label: "Far (5+ years)",
    desc: "Long-range developments to monitor for future positioning.",
  },
];

export function WhatAreSignals() {
  return (
    <Accordion.Item value="what-are-signals" id="what-are-signals">
      <AccordionTrigger icon={<Radio className="h-5 w-5" />}>
        What Are Signals?
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Signals are the atomic units of strategic intelligence in Foresight.
          Each signal tracks a single emerging trend, technology, policy shift,
          or issue that could impact City of Austin operations. Signals are
          continuously enriched with new sources, AI analysis, and quality
          scoring to keep your intelligence current.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Strategic Pillars
        </h4>
        <p className="text-sm mb-3">
          Every signal is classified under one of six strategic pillars that
          align with Austin&rsquo;s priorities:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
          {PILLARS.map(({ code, label }) => (
            <div
              key={code}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-brand-blue/10 dark:bg-brand-blue/20 border border-brand-blue/15 dark:border-brand-blue/30"
            >
              <span className="text-xs font-mono font-bold text-brand-blue dark:text-brand-light-blue">
                {code}
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {label}
              </span>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Time Horizons
        </h4>
        <p className="text-sm mb-3">
          Horizons indicate when a signal is likely to have its primary impact:
        </p>
        <div className="space-y-2 mb-5">
          {HORIZONS.map(({ code, label, desc }) => (
            <div
              key={code}
              className="flex items-start gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface"
            >
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-brand-blue/10 dark:bg-brand-blue/20 text-xs font-bold text-brand-blue dark:text-brand-light-blue shrink-0">
                {code}
              </span>
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {label}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Signal Quality Index (SQI)
        </h4>
        <p className="text-sm mb-3">
          Every signal receives a quality score from 0 to 100, computed from
          five dimensions: source authority, source diversity, corroboration,
          recency, and municipal specificity. Higher scores indicate more
          credible, well-sourced intelligence.
        </p>
        <div className="space-y-3 mb-3">
          <SqiBar score={85} label="High quality" />
          <SqiBar score={55} label="Moderate" />
          <SqiBar score={25} label="Needs review" />
        </div>

        <GuideFigure
          src="/guide/signal-scoring-detail.png"
          alt="A signal detail page scrolled to show the maturity meter, the activity panel listing sources and timeline events, and the key developments section."
          caption="On a live signal, the maturity meter and activity trail update as new sources, research, and timeline events come in."
        />

        <ProTip>
          Use the quality score filter on the Signals page to focus on
          high-confidence intelligence. A minimum threshold of 60 is a good
          starting point for strategic decisions.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
