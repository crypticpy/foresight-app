/**
 * Accordion section 1/9 — what the Discover library is, where signals
 * come from, and what each card shows.
 *
 * @module pages/GuideDiscover/sections/Library
 */

import * as Accordion from "@radix-ui/react-accordion";
import {
  BookOpen,
  Cpu,
  GraduationCap,
  Landmark,
  Newspaper,
  Rss,
} from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

const SOURCE_CATEGORIES = [
  {
    name: "News",
    icon: <Newspaper className="h-5 w-5" />,
    examples: "Reuters, AP, GCN, GovTech",
    desc: "Breaking news and current events coverage with municipal relevance",
  },
  {
    name: "Academic",
    icon: <GraduationCap className="h-5 w-5" />,
    examples: "arXiv, research journals",
    desc: "Peer-reviewed research and pre-print publications",
  },
  {
    name: "Government",
    icon: <Landmark className="h-5 w-5" />,
    examples: ".gov domains, GAO, NIST",
    desc: "Official government publications, reports, and policy documents",
  },
  {
    name: "Tech Media",
    icon: <Cpu className="h-5 w-5" />,
    examples: "TechCrunch, Wired, The Verge",
    desc: "Technology news, product launches, and innovation coverage",
  },
  {
    name: "RSS Feeds",
    icon: <Rss className="h-5 w-5" />,
    examples: "Hacker News, Ars Technica",
    desc: "Curated feeds from specialized publications and aggregators",
  },
];

export function Library() {
  return (
    <Accordion.Item value="library" id="library">
      <AccordionTrigger icon={<BookOpen className="h-5 w-5" />}>
        The Intelligence Library
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          The Discover page is the central hub for all strategic intelligence
          signals in Foresight. Every signal you see here has been automatically
          discovered, classified, and scored by the AI-powered discovery
          pipeline running behind the scenes.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Where Signals Come From
        </h4>
        <p className="mb-4">
          Foresight continuously monitors hundreds of sources across five
          categories. Each source category brings a different lens to the
          strategic landscape:
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          {SOURCE_CATEGORIES.map((cat) => (
            <div
              key={cat.name}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-brand-blue dark:text-brand-light-blue">
                  {cat.icon}
                </span>
                <span className="font-semibold text-gray-900 dark:text-white text-sm">
                  {cat.name}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                {cat.desc}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 italic">
                {cat.examples}
              </p>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          What You See on Each Card
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-3">
          <li>
            <span className="font-medium">Title and summary</span> &mdash; a
            concise description of the signal
          </li>
          <li>
            <span className="font-medium">Strategic pillar badge</span> &mdash;
            which pillar(s) the signal aligns with
          </li>
          <li>
            <span className="font-medium">Quality tier indicator</span> &mdash;
            High, Moderate, or Needs Verification
          </li>
          <li>
            <span className="font-medium">Horizon tag</span> &mdash; the time
            horizon (H1, H2, or H3)
          </li>
          <li>
            <span className="font-medium">Score highlights</span> &mdash; key
            scoring dimensions visible at a glance
          </li>
          <li>
            <span className="font-medium">Follow status</span> &mdash; star icon
            indicates whether you are tracking this signal
          </li>
        </ul>

        <ProTip>
          Use the quick filter chips at the top of Discover to rapidly scope
          your view. "New This Week" shows signals discovered in the last 7
          days, while "Updated This Week" catches recently re-scored or enriched
          signals you may have already seen.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
