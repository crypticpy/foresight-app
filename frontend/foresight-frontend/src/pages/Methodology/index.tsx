/**
 * Composer for the Methodology page. Owns the hash → accordion-section
 * mapping that lets deep links like `/methodology#sqi` auto-expand the
 * correct accordion item on load, and renders the page chrome plus the
 * six section components.
 *
 * @module pages/Methodology
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import * as Accordion from "@radix-ui/react-accordion";
import { Pipeline } from "./sections/Pipeline";
import { Scoring } from "./sections/Scoring";
import { SourceTiers } from "./sections/SourceTiers";
import { AIAnalysis } from "./sections/AIAnalysis";
import { UserContent } from "./sections/UserContent";
import { Feedback } from "./sections/Feedback";

// Sub-section anchors map to the parent accordion item so the right
// section expands when the user navigates with one of these hashes.
const HASH_TO_SECTION: Record<string, string> = {
  sqi: "scoring",
  "source-authority": "scoring",
  "source-diversity": "scoring",
  corroboration: "scoring",
  recency: "scoring",
  "municipal-specificity": "scoring",
};

export default function Methodology() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      const timer = setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [location.hash]);

  const hashId = location.hash ? location.hash.replace("#", "") : undefined;
  const defaultOpen = hashId ? (HASH_TO_SECTION[hashId] ?? hashId) : undefined;

  return (
    <>
      <style>{`
        @media print {
          [data-state="closed"] > [role="region"] {
            display: block !important;
            height: auto !important;
          }
          [data-radix-collection-item] svg.lucide-chevron-down {
            display: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-brand-faded-white dark:bg-brand-dark-blue">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <header className="mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
              Methodology
            </h1>
            <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
              How Foresight discovers, scores, and delivers strategic
              intelligence for the City of Austin.
            </p>
          </header>

          <Accordion.Root
            type="multiple"
            defaultValue={defaultOpen ? [defaultOpen] : []}
            className="divide-y divide-gray-200 dark:divide-gray-700 border-t border-b border-gray-200 dark:border-gray-700"
          >
            <Pipeline />
            <Scoring />
            <SourceTiers />
            <AIAnalysis />
            <UserContent />
            <Feedback />
          </Accordion.Root>

          <p className="mt-10 text-sm text-gray-400 dark:text-gray-500 text-center no-print">
            Questions about our methodology?{" "}
            <a
              href="mailto:contact-foresight@austintexas.gov?subject=Foresight%20methodology%20question"
              className="text-brand-blue dark:text-brand-light-blue hover:underline"
            >
              Reach out to the Foresight team
            </a>
            .
          </p>
        </div>
      </div>
    </>
  );
}
