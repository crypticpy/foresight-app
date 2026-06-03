/**
 * Accordion section 6/9 — visual pipeline diagram, source-categories table,
 * and deduplication explanation.
 *
 * @module pages/GuideDiscover/sections/DiscoveryPipeline
 */

import * as Accordion from "@radix-ui/react-accordion";
import {
  BarChart3,
  Brain,
  CheckCircle,
  GitCompare,
  Layers,
  Rss,
} from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { cn } from "@/lib/utils";
import { AccordionTrigger, AccordionContent } from "../_accordion";
import { InfoBox } from "../InfoBox";

const PIPELINE_STAGES = [
  {
    label: "Source Fetch",
    icon: <Rss className="h-5 w-5" />,
    desc: "Content is collected from 5 source categories: news agencies, academic databases, government publications, tech media, and RSS feeds.",
  },
  {
    label: "AI Triage",
    icon: <Brain className="h-5 w-5" />,
    desc: "An AI triage step analyzes each piece of content for relevance to Austin's strategic priorities, filtering out noise and off-topic material.",
  },
  {
    label: "Classification",
    icon: <Layers className="h-5 w-5" />,
    desc: "Relevant content is classified by strategic pillar, maturity stage, and time horizon using AI analysis.",
  },
  {
    label: "Scoring",
    icon: <BarChart3 className="h-5 w-5" />,
    desc: "Multi-factor scoring assigns 0-100 values for Impact, Relevance, Velocity, Novelty, Opportunity, and Risk. A composite Signal Quality Index (SQI) is computed.",
  },
  {
    label: "Deduplication",
    icon: <GitCompare className="h-5 w-5" />,
    desc: "Near-identical content is automatically merged so you don't see the same story twice, even when several sources cover it.",
  },
  {
    label: "Published",
    icon: <CheckCircle className="h-5 w-5" />,
    desc: "Signals that pass all checks appear in the Discover library, ready for analysts to explore, follow, and act upon.",
  },
];

export function DiscoveryPipeline() {
  return (
    <Accordion.Item value="pipeline" id="pipeline">
      <AccordionTrigger icon={<Rss className="h-5 w-5" />}>
        The Discovery Pipeline
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-5">
          Understanding how signals arrive in Discover helps you interpret their
          quality and coverage. Here is the automated pipeline that runs behind
          the scenes:
        </p>

        <div className="relative mb-6">
          <div className="space-y-0">
            {PIPELINE_STAGES.map((stage, idx) => (
              <div
                key={stage.label}
                className="relative flex items-start gap-4"
              >
                {idx < PIPELINE_STAGES.length - 1 && (
                  <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                )}
                <div
                  className={cn(
                    "relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2",
                    idx === PIPELINE_STAGES.length - 1
                      ? "border-brand-green bg-brand-green/10 text-brand-green"
                      : "border-brand-blue/40 bg-brand-light-blue/30 dark:bg-brand-blue/10 text-brand-blue dark:text-brand-light-blue",
                  )}
                >
                  {stage.icon}
                </div>
                <div className="pb-6 pt-1.5">
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                    {stage.label}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                    {stage.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Source Categories in Detail
        </h4>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                <th className="text-left py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                  Category
                </th>
                <th className="text-left py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                  Key Sources
                </th>
                <th className="text-left py-2 font-semibold text-gray-900 dark:text-gray-100">
                  Content Type
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="py-2 pr-4 font-medium">News</td>
                <td className="py-2 pr-4">Reuters, AP, GCN, GovTech</td>
                <td className="py-2">
                  Breaking news, policy changes, event coverage
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">Academic</td>
                <td className="py-2 pr-4">arXiv, research journals</td>
                <td className="py-2">
                  Peer-reviewed research, pre-prints, white papers
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">Government</td>
                <td className="py-2 pr-4">.gov domains, GAO, NIST</td>
                <td className="py-2">
                  Official reports, regulations, guidelines
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">Tech Media</td>
                <td className="py-2 pr-4">TechCrunch, Wired, The Verge</td>
                <td className="py-2">
                  Technology developments, product launches
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">RSS</td>
                <td className="py-2 pr-4">Hacker News, Ars Technica</td>
                <td className="py-2">
                  Community-curated tech and science discussion
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <InfoBox>
          <span className="font-medium">Deduplication explained:</span> When
          multiple sources report on the same topic, Foresight recognizes that
          they are covering the same story. Near-identical content is merged
          into a single signal (adding source diversity) or set aside, so you
          don't see duplicates and the library stays clean.
        </InfoBox>

        <ProTip defaultOpen>
          The pipeline runs on a configurable schedule. If you notice a gap in
          coverage for a specific topic area, consider creating a user-generated
          signal or requesting a manual discovery run through the admin
          settings.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
