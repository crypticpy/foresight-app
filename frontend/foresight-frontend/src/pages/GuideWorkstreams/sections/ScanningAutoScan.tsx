/**
 * Accordion section 8/10 — manual workstream scans, auto-scan toggle, rate
 * limits, and scan history.
 *
 * @module pages/GuideWorkstreams/sections/ScanningAutoScan
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Clock, Settings, Telescope } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function ScanningAutoScan() {
  return (
    <Accordion.Item value="scanning" id="scanning">
      <AccordionTrigger icon={<Telescope className="h-5 w-5" />}>
        Scanning & Auto-Scan
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Workstream scans actively search the web for new content matching your
          workstream's focus. This goes beyond the existing database -- it
          discovers fresh signals that have not yet been captured by the system.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Manual Scan
        </h4>
        <p className="mb-3">
          Click <strong>Scan for Updates</strong> on the Kanban board toolbar.
          The system will:
        </p>
        <ol className="list-decimal list-inside space-y-1 mb-4">
          <li>
            Build search queries from your workstream's keywords and pillar
            context
          </li>
          <li>
            Search multiple source types (RSS, news, web search, academic)
          </li>
          <li>Filter results for relevance and freshness</li>
          <li>De-duplicate against existing signals in the database</li>
          <li>Create new signal cards and add them to your Inbox</li>
        </ol>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Auto-Scan
        </h4>
        <p className="mb-3">
          Enable the auto-scan toggle on your workstream to have scans run
          automatically on a periodic schedule. When auto-scan is active, new
          signals are added to your Inbox without manual intervention, keeping
          your workstream continuously fed with fresh intelligence.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Rate Limits & Best Practices
        </h4>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="font-medium text-gray-900 dark:text-white">
                  Scan Limit
                </span>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                2 manual scans per workstream per day. This prevents excessive
                API usage while keeping content fresh.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Settings className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="font-medium text-gray-900 dark:text-white">
                  Requirements
                </span>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                Scans require at least keywords or strategic pillars to be
                configured. A workstream with no filters cannot scan.
              </p>
            </div>
          </div>
        </div>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Scan History
        </h4>
        <p>
          Each scan's results are tracked, including how many new signals were
          created and how many were added to your workstream. The status bar on
          the Kanban board reflects the total signal count across all columns
          after a scan completes.
        </p>

        <ProTip>
          Time your manual scans strategically. Run one in the morning to catch
          overnight developments, and save the second for later in the day if a
          breaking topic emerges. Rely on auto-scan for routine monitoring.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
