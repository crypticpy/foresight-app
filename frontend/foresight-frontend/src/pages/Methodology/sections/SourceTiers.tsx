/**
 * Methodology accordion section 3/6 — three-tier domain credibility taxonomy.
 *
 * @module pages/Methodology/sections/SourceTiers
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Building2 } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

interface Tier {
  label: string;
  examples: string;
  containerClass: string;
  headingClass: string;
}

const TIERS: Tier[] = [
  {
    label: "Tier 1 — Authoritative",
    examples:
      "Gartner, McKinsey, RAND Corporation, federal agencies (GAO, CBO, NIST), leading research universities (MIT, Stanford, UT Austin)",
    containerClass:
      "rounded-lg border border-brand-green/30 bg-brand-light-green/40 dark:bg-brand-green/10 dark:border-brand-green/20 p-4",
    headingClass:
      "font-semibold text-brand-compliant-green dark:text-brand-green mb-1",
  },
  {
    label: "Tier 2 — Credible",
    examples:
      "Municipal associations (ICMA, NLC), innovation networks (Bloomberg Cities, Ash Center), professional associations (APA, ASCE)",
    containerClass:
      "rounded-lg border border-brand-blue/20 bg-brand-light-blue/40 dark:bg-brand-blue/10 dark:border-brand-blue/20 p-4",
    headingClass:
      "font-semibold text-brand-blue dark:text-brand-light-blue mb-1",
  },
  {
    label: "Tier 3 — General",
    examples:
      "Technology media (TechCrunch, Wired, Ars Technica), think tanks, international organizations (OECD, World Bank)",
    containerClass:
      "rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-dark-surface/50 p-4",
    headingClass: "font-semibold text-gray-700 dark:text-gray-300 mb-1",
  },
];

export function SourceTiers() {
  return (
    <Accordion.Item value="tiers" id="tiers">
      <AccordionTrigger icon={<Building2 className="h-5 w-5" />}>
        Source Authority Tiers
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          We maintain a curated list of over 100 organizations categorized into
          three credibility tiers. Tier ratings are combined with user feedback
          and pipeline performance for a composite reputation score.
        </p>

        <div className="space-y-5">
          {TIERS.map((tier) => (
            <div key={tier.label} className={tier.containerClass}>
              <h4 className={tier.headingClass}>{tier.label}</h4>
              <p className="text-sm">{tier.examples}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 italic">
          Users can rate individual sources to adjust domain reputation scores
          over time, ensuring the system evolves with the team's expertise.
        </p>
      </AccordionContent>
    </Accordion.Item>
  );
}
