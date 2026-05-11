/**
 * Methodology accordion section 4/6 — pillar/maturity classification and the
 * six multi-factor score dimensions.
 *
 * @module pages/Methodology/sections/AIAnalysis
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Brain } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

const PILLARS = [
  { code: "CH", label: "Community Health" },
  { code: "EW", label: "Economic Workforce" },
  { code: "HG", label: "Housing" },
  { code: "HH", label: "Homelessness" },
  { code: "MC", label: "Mobility" },
  { code: "PS", label: "Public Safety" },
];

const MATURITY_STAGES = [
  "Concept",
  "Exploring",
  "Pilot",
  "Implementing",
  "Scaling",
  "Mature",
];

const SCORE_DIMENSIONS = [
  { name: "Impact", desc: "Potential effect on city operations" },
  { name: "Relevance", desc: "Alignment to Austin priorities" },
  { name: "Velocity", desc: "Speed of change or adoption" },
  { name: "Novelty", desc: "How new or emerging the topic is" },
  { name: "Opportunity", desc: "Potential for positive action" },
  { name: "Risk", desc: "Threats if the topic is ignored" },
];

export function AIAnalysis() {
  return (
    <Accordion.Item value="analysis" id="analysis">
      <AccordionTrigger icon={<Brain className="h-5 w-5" />}>
        How AI Analyzes Content
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          We use GPT-5.4-mini to classify content across multiple dimensions
          including strategic pillar alignment, maturity stage, time horizon,
          and multi-factor scoring for impact, relevance, velocity, novelty,
          opportunity, and risk.
        </p>

        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Strategic Pillars
            </h4>
            <div className="flex flex-wrap gap-2 text-xs">
              {PILLARS.map(({ code, label }) => (
                <span
                  key={code}
                  className="inline-flex items-center px-2 py-1 rounded bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-light-blue font-medium"
                >
                  {code}
                  <span className="ml-1 font-normal text-gray-500 dark:text-gray-400 hidden sm:inline">
                    {label}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Maturity Stages
            </h4>
            <ol className="list-decimal list-inside text-sm space-y-0.5">
              {MATURITY_STAGES.map((stage) => (
                <li key={stage}>{stage}</li>
              ))}
            </ol>
          </div>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mt-5 mb-2">
          Score Dimensions (0&ndash;100 each)
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {SCORE_DIMENSIONS.map(({ name, desc }) => (
            <div
              key={name}
              className="rounded-md border border-gray-200 dark:border-gray-700 p-3"
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {name}
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {desc}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 italic">
          When AI parsing cannot determine a score with confidence, the value is
          flagged as a default so analysts can review and adjust manually.
        </p>
      </AccordionContent>
    </Accordion.Item>
  );
}
