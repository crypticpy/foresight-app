/**
 * Accordion section 1/10 — defines what a workstream is and contrasts it
 * with passively following signals.
 *
 * @module pages/GuideWorkstreams/sections/WhatAreWorkstreams
 */

import * as Accordion from "@radix-ui/react-accordion";
import { CheckCircle, FolderOpen } from "lucide-react";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function WhatAreWorkstreams() {
  return (
    <Accordion.Item value="what-are-workstreams" id="what-are-workstreams">
      <AccordionTrigger icon={<FolderOpen className="h-5 w-5" />}>
        What Are Workstreams?
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          A{" "}
          <strong className="text-brand-dark-blue dark:text-brand-light-blue">
            Workstream
          </strong>{" "}
          is a personal research workspace for systematically investigating a
          topic area that matters to your team. While following signals on the
          Signals page gives you a personal feed of updates, a workstream goes
          further: it provides a structured research pipeline, AI-assisted deep
          dives, executive brief generation, and polished export capabilities.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          How Workstreams Differ from Following Signals
        </h4>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                <th className="text-left py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                  Capability
                </th>
                <th className="text-left py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                  Following Signals
                </th>
                <th className="text-left py-2 font-semibold text-gray-900 dark:text-gray-100">
                  Workstreams
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="py-2 pr-4 font-medium">Track updates</td>
                <td className="py-2 pr-4">
                  <CheckCircle className="h-4 w-4 text-brand-green inline" />
                </td>
                <td className="py-2">
                  <CheckCircle className="h-4 w-4 text-brand-green inline" />
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">Kanban workflow</td>
                <td className="py-2 pr-4 text-gray-400">--</td>
                <td className="py-2">
                  <CheckCircle className="h-4 w-4 text-brand-green inline" />
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">AI deep research</td>
                <td className="py-2 pr-4 text-gray-400">--</td>
                <td className="py-2">
                  <CheckCircle className="h-4 w-4 text-brand-green inline" />
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">Executive briefs</td>
                <td className="py-2 pr-4 text-gray-400">--</td>
                <td className="py-2">
                  <CheckCircle className="h-4 w-4 text-brand-green inline" />
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">PDF / PPTX export</td>
                <td className="py-2 pr-4 text-gray-400">--</td>
                <td className="py-2">
                  <CheckCircle className="h-4 w-4 text-brand-green inline" />
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">
                  Scoped discovery scans
                </td>
                <td className="py-2 pr-4 text-gray-400">--</td>
                <td className="py-2">
                  <CheckCircle className="h-4 w-4 text-brand-green inline" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          When to Create a Workstream
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            You need to prepare a briefing, memo, or presentation for leadership
          </li>
          <li>
            A topic requires structured investigation across multiple signals
          </li>
          <li>
            Your team is tracking an emerging area that aligns with one or more
            strategic pillars
          </li>
          <li>
            You want automated, ongoing discovery scans scoped to a specific
            focus area
          </li>
          <li>You need to produce a portfolio of briefs on related topics</li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Strategic Alignment
        </h4>
        <p>
          Every workstream can be aligned to Austin's strategic pillars
          (Community Health, Mobility, Housing, Economic, Environmental,
          Cultural) and the CMO's Top 25 Priorities. This alignment helps the AI
          surface the most relevant signals and ensures briefs frame findings in
          terms of the city's goals.
        </p>
      </AccordionContent>
    </Accordion.Item>
  );
}
