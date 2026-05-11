/**
 * Methodology accordion section 2/6 — Source Quality Index (SQI) breakdown.
 * Renders the component-weight table plus example bars.
 *
 * @module pages/Methodology/sections/Scoring
 */

import * as Accordion from "@radix-ui/react-accordion";
import { ShieldCheck } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";
import { SqiBar } from "../SqiBar";

interface SqiComponent {
  id: string;
  name: string;
  weight: string;
  desc: string;
}

const SQI_COMPONENTS: SqiComponent[] = [
  {
    id: "source-authority",
    name: "Source Authority",
    weight: "30%",
    desc: "Domain reputation tier scoring",
  },
  {
    id: "source-diversity",
    name: "Source Diversity",
    weight: "20%",
    desc: "Variety of source types referenced",
  },
  {
    id: "corroboration",
    name: "Corroboration",
    weight: "20%",
    desc: "Number of independent story clusters",
  },
  {
    id: "recency",
    name: "Recency",
    weight: "15%",
    desc: "Source freshness and currency",
  },
  {
    id: "municipal-specificity",
    name: "Municipal Specificity",
    weight: "15%",
    desc: "Government and local relevance",
  },
];

export function Scoring() {
  return (
    <Accordion.Item value="scoring" id="scoring">
      <AccordionTrigger icon={<ShieldCheck className="h-5 w-5" />}>
        How We Score Quality (Source Quality Index)
      </AccordionTrigger>
      <AccordionContent>
        {/* Scroll target for /methodology#sqi deep links */}
        <div id="sqi" className="scroll-mt-4" />

        <p className="mb-4">
          Every card receives a Source Quality Index (SQI) from 0&ndash;100,
          computed from five dimensions of source quality. Higher scores
          indicate more credible, well-sourced information.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          SQI Components
        </h4>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                <th className="text-left py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                  Component
                </th>
                <th className="text-left py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                  Weight
                </th>
                <th className="text-left py-2 font-semibold text-gray-900 dark:text-gray-100">
                  What It Measures
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {SQI_COMPONENTS.map((c) => (
                <tr key={c.id} id={c.id} className="scroll-mt-4">
                  <td className="py-2 pr-4 font-medium">{c.name}</td>
                  <td className="py-2 pr-4 tabular-nums">{c.weight}</td>
                  <td className="py-2">{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Score Examples
        </h4>
        <div className="space-y-3">
          <SqiBar score={85} label="High quality" />
          <SqiBar score={55} label="Moderate" />
          <SqiBar score={25} label="Low / needs review" />
        </div>
      </AccordionContent>
    </Accordion.Item>
  );
}
