/**
 * The body of the brief modal: a creation-date row, a highlighted
 * executive-summary card, and the full markdown content. Both
 * sections expose a copy-to-clipboard button.
 *
 * @module components/kanban/BriefPreviewModal/BriefContent
 */

import { memo, useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Calendar, Check, Copy } from "lucide-react";

import { briefMarkdownComponents } from "./markdownComponents";
import { formatDate, type ExecutiveBrief } from "./types";

export interface BriefContentProps {
  brief: ExecutiveBrief;
}

export const BriefContent = memo(function BriefContent({
  brief,
}: BriefContentProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleCopy = useCallback((content: string, section: string) => {
    navigator.clipboard.writeText(content);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Calendar className="h-4 w-4" aria-hidden="true" />
        <span>Generated {formatDate(brief.created_at)}</span>
        {brief.version && brief.version > 1 && (
          <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
            v{brief.version}
          </span>
        )}
      </div>

      <div className="bg-gradient-to-br from-brand-blue/5 to-brand-blue/10 dark:from-brand-blue/10 dark:to-brand-blue/20 border border-brand-blue/20 dark:border-brand-blue/30 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-brand-blue dark:text-brand-light-blue uppercase tracking-wide">
            Executive Summary
          </h3>
          <button
            onClick={() => handleCopy(brief.executive_summary, "summary")}
            className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            aria-label="Copy executive summary"
          >
            {copiedSection === "summary" ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
          {brief.executive_summary}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Full Brief
          </h3>
          <button
            onClick={() => handleCopy(brief.content_markdown, "content")}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            aria-label="Copy full brief content"
          >
            {copiedSection === "content" ? (
              <>
                <Check className="h-3 w-3 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none bg-gray-50 dark:bg-dark-surface/50 rounded-lg p-4 overflow-hidden">
          <ReactMarkdown components={briefMarkdownComponents}>
            {brief.content_markdown}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});
