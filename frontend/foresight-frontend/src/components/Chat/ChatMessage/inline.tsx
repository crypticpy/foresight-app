/**
 * Inline-level markdown parser used by every block renderer in
 * `./blocks`. Handles links `[text](url)`, bold, italic, inline code,
 * citation references `[N]`, bare external URLs, and bare internal
 * Foresight app paths (which are upgraded to React Router `<Link>`
 * pills).
 *
 * Internal-route detection (`isInternalPath`) is also exported so
 * block-level renderers can route table cells and code fences through
 * the same logic.
 *
 * @module components/Chat/ChatMessage/inline
 */

import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { Citation } from "../../../lib/chat-api";

/** Routes the chat agent commonly references in answers. */
const INTERNAL_ROUTE_PREFIXES =
  "signals|patterns|workstreams|discover|ask|feeds|compare|analytics|methodology|how-it-works|guide|cards";

const INTERNAL_PATH_RE = new RegExp(
  `^/(?:${INTERNAL_ROUTE_PREFIXES})(?:/[^\\s?#]*)?(?:[?#].*)?$`,
);

export const isInternalPath = (s: string): boolean =>
  INTERNAL_PATH_RE.test(s.trim());

/**
 * Parses inline markdown formatting within a single line of text:
 * links `[text](url)`, bold, italic, inline code, citation references
 * `[N]`, bare external URLs, and bare internal app paths.
 */
export function parseInline(
  rawText: string,
  citations: Citation[],
  onCitationClick?: (citation: Citation) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  // Strip empty brackets [] (no number inside) before parsing.
  const text = rawText.replace(/\[\]/g, "");

  // Combined regex for all inline elements.
  // Groups:
  //  1: [text](url) whole · 2: text · 3: url
  //  4: **bold** whole · 5: bold inner
  //  6: *italic* whole · 7: italic inner
  //  8: `code` whole · 9: code inner
  // 10: [N] whole · 11: N
  // 12: bare http(s) URL
  // 13: bare internal /path (preceded by start, whitespace, or punctuation)
  const regex =
    /(\[([^\]]+)\]\(([^)]+)\))|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(\d+)\])|(\bhttps?:\/\/[^\s)\]]+)|(?:^|(?<=[\s(>,;!?]))(\/(?:signals|patterns|workstreams|discover|ask|feeds|compare|analytics|methodology|how-it-works|guide|cards)(?:\/[A-Za-z0-9_-]+)?)(?=[\s).,;!?]|$)/g;

  const internalLinkClass = cn(
    "inline-flex items-baseline gap-0.5",
    "px-1.5 py-0.5 rounded-md text-[12px] font-medium font-mono",
    "bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20",
    "dark:bg-brand-blue/20 dark:text-blue-300 dark:hover:bg-brand-blue/30",
    "transition-colors no-underline",
  );

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // [text](url) — internal routes use React Router; externals open in new tab.
      const linkText = match[2]!;
      const linkUrl = match[3]!;
      if (isInternalPath(linkUrl)) {
        nodes.push(
          <Link
            key={`link-${match.index}`}
            to={linkUrl}
            className="text-brand-blue hover:underline inline-flex items-center gap-0.5 font-medium"
          >
            {linkText}
            <ArrowUpRight className="inline h-3 w-3 shrink-0" />
          </Link>,
        );
      } else {
        nodes.push(
          <a
            key={`link-${match.index}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-blue hover:underline inline-flex items-center gap-0.5"
          >
            {linkText}
            <ExternalLink className="inline h-3 w-3 shrink-0" />
          </a>,
        );
      }
    } else if (match[4]) {
      nodes.push(
        <strong key={`b-${match.index}`} className="font-semibold">
          {match[5]}
        </strong>,
      );
    } else if (match[6]) {
      nodes.push(
        <em key={`i-${match.index}`} className="italic">
          {match[7]}
        </em>,
      );
    } else if (match[8]) {
      // `code` — internal app routes render as a Link pill.
      const codeContent = match[9]!;
      if (isInternalPath(codeContent)) {
        nodes.push(
          <Link
            key={`ipath-code-${match.index}`}
            to={codeContent.trim()}
            className={internalLinkClass}
          >
            {codeContent}
            <ArrowUpRight className="inline h-3 w-3 shrink-0" />
          </Link>,
        );
      } else {
        nodes.push(
          <code
            key={`c-${match.index}`}
            className={cn(
              "px-1.5 py-0.5 rounded text-xs font-mono",
              "bg-gray-100 dark:bg-dark-surface-elevated",
              "text-red-600 dark:text-red-400",
            )}
          >
            {codeContent}
          </code>,
        );
      }
    } else if (match[10]) {
      // [N] citation reference
      const citationIndex = parseInt(match[11]!, 10);
      const citation = citations.find((c) => c.index === citationIndex);

      if (citation) {
        nodes.push(
          <button
            key={`cite-${match.index}`}
            type="button"
            onClick={() => {
              if (onCitationClick) {
                onCitationClick(citation);
              } else if (citation.url) {
                window.open(citation.url, "_blank", "noopener,noreferrer");
              }
            }}
            className={cn(
              "inline-flex items-center justify-center",
              "min-w-[1.25rem] h-5 px-1 mx-0.5",
              "text-[10px] font-semibold rounded-full",
              "bg-brand-blue/10 text-brand-blue",
              "hover:bg-brand-blue/20",
              "dark:bg-brand-blue/20 dark:text-blue-300 dark:hover:bg-brand-blue/30",
              "cursor-pointer transition-colors duration-150",
              "align-super",
            )}
            title={citation.title}
            aria-label={`Citation ${citationIndex}: ${citation.title}`}
          >
            {citationIndex}
          </button>,
        );
      } else {
        // Unmatched citation — render a styled "ghost" chip so the
        // footnote reads as intentional and stays visually consistent.
        nodes.push(
          <span
            key={`cite-ghost-${match.index}`}
            className={cn(
              "inline-flex items-center justify-center",
              "min-w-[1.25rem] h-5 px-1 mx-0.5",
              "text-[10px] font-semibold rounded-full",
              "bg-gray-200 text-gray-500",
              "dark:bg-dark-surface-elevated dark:text-gray-400",
              "align-super",
            )}
            title="Source not found in this answer's citation list"
            aria-label={`Citation ${citationIndex} (no source linked)`}
          >
            {citationIndex}
          </span>,
        );
      }
    } else if (match[12]) {
      // Bare external URL
      const url = match[12];
      nodes.push(
        <a
          key={`url-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-blue hover:underline break-all inline-flex items-baseline gap-0.5"
        >
          {url}
          <ExternalLink className="inline h-3 w-3 shrink-0" />
        </a>,
      );
    } else if (match[13]) {
      // Bare internal app path
      const path = match[13];
      nodes.push(
        <Link
          key={`ipath-${match.index}`}
          to={path}
          className={internalLinkClass}
        >
          {path}
          <ArrowUpRight className="inline h-3 w-3 shrink-0" />
        </Link>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
