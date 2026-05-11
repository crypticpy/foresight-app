/**
 * Lightweight markdown renderer used by the chat bubble. Handles a
 * curated subset of Markdown (headings, code blocks, horizontal rules,
 * tables, blockquotes, nested bullet lists, numbered lists, paragraphs)
 * without pulling in a full markdown library so the bundle stays lean.
 *
 * Inline-level formatting (links, bold/italic/code, citations, bare
 * URLs and app paths) is delegated to `./inline`.
 *
 * @module components/Chat/ChatMessage/markdown
 */

import React from "react";
import { cn } from "../../../lib/utils";
import type { Citation } from "../../../lib/chat-api";
import { parseInline } from "./inline";

/** A parsed bullet list item with its nesting depth and text content. */
interface NestedListItem {
  depth: number;
  text: string;
}

/**
 * Recursively renders nested bullet list items grouped by indentation
 * depth. Items at the current depth are rendered as `<li>`, and deeper
 * items are wrapped in a nested `<ul>` inside the preceding `<li>`.
 */
function renderNestedList(
  items: NestedListItem[],
  baseDepth: number,
  citations: Citation[],
  onCitationClick?: (citation: Citation) => void,
  keyPrefix = "ul",
): React.ReactNode {
  const elements: React.ReactNode[] = [];
  let idx = 0;

  while (idx < items.length) {
    const item = items[idx]!;

    if (item.depth === baseDepth) {
      const children: NestedListItem[] = [];
      let next = idx + 1;
      while (next < items.length && items[next]!.depth > baseDepth) {
        children.push(items[next]!);
        next++;
      }

      elements.push(
        <li
          key={`${keyPrefix}-li-${idx}`}
          className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed"
        >
          {parseInline(item.text, citations, onCitationClick)}
          {children.length > 0 && (
            <ul className="ml-4 mt-0.5 space-y-0.5 list-disc">
              {renderNestedList(
                children,
                children[0]!.depth,
                citations,
                onCitationClick,
                `${keyPrefix}-${idx}`,
              )}
            </ul>
          )}
        </li>,
      );
      idx = next;
    } else {
      // Shouldn't happen at correct baseDepth; advance to avoid infinite loop.
      idx++;
    }
  }

  return <>{elements}</>;
}

/**
 * Top-level entry point. Splits the message into block-level chunks
 * (headings, code blocks, tables, lists, paragraphs, …) and delegates
 * inline-level parsing to `parseInline`.
 */
export function parseMarkdown(
  text: string,
  citations: Citation[],
  onCitationClick?: (citation: Citation) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // 1. Code block: ```...```
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++; // Skip opening ```
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // Skip closing ```

      nodes.push(
        <pre
          key={`code-${i}`}
          className={cn(
            "my-2 p-3 rounded-lg overflow-x-auto text-xs",
            "bg-gray-900 text-gray-100 dark:bg-black/40",
            "border border-gray-700 dark:border-gray-600",
          )}
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // 2. Horizontal rule: ---, ***, ___ (possibly with spaces)
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      nodes.push(
        <hr
          key={`hr-${i}`}
          className="my-4 border-gray-200 dark:border-gray-700"
        />,
      );
      i++;
      continue;
    }

    // 3. Table: consecutive lines starting with |
    if (/^\s*\|/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) {
        tableLines.push(lines[i]!);
        i++;
      }

      const parseRow = (rowLine: string): string[] =>
        rowLine
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((cell) => cell.trim());

      const hasSeparator =
        tableLines.length >= 2 && /^\s*\|[\s:|-]+\|\s*$/.test(tableLines[1]!);

      const headerRow = hasSeparator ? parseRow(tableLines[0]!) : null;
      const bodyStartIndex = hasSeparator ? 2 : 0;
      const bodyRows = tableLines.slice(bodyStartIndex).map(parseRow);

      nodes.push(
        <div key={`table-${i}`} className="my-2 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            {headerRow && (
              <thead>
                <tr className="border-b border-gray-300 dark:border-gray-600">
                  {headerRow.map((cell, cIdx) => (
                    <th
                      key={cIdx}
                      className="px-3 py-1.5 text-left font-semibold text-gray-900 dark:text-gray-100"
                    >
                      {parseInline(cell, citations, onCitationClick)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className={cn(
                    rIdx % 2 === 0
                      ? "bg-gray-50 dark:bg-dark-surface"
                      : "bg-white dark:bg-dark-surface-elevated",
                  )}
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300"
                    >
                      {parseInline(cell, citations, onCitationClick)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // 4. Blockquote: > text
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        quoteLines.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }

      nodes.push(
        <blockquote
          key={`bq-${i}`}
          className={cn(
            "my-2 pl-4 py-2",
            "border-l-[3px] border-brand-blue dark:border-brand-blue/50",
            "bg-gray-50 dark:bg-dark-surface",
            "text-sm italic text-gray-700 dark:text-gray-300",
          )}
        >
          {quoteLines.map((qLine, qIdx) => (
            <p key={qIdx} className="leading-relaxed">
              {parseInline(qLine, citations, onCitationClick)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // 5. Heading: # through ####
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const content = headingMatch[2] ?? "";
      const Tag = `h${level + 1}` as keyof JSX.IntrinsicElements; // h2-h5
      const sizeClass =
        level === 1
          ? "text-lg font-bold"
          : level === 2
            ? "text-base font-semibold"
            : "text-sm font-semibold";
      nodes.push(
        <Tag
          key={`h-${i}`}
          className={cn(
            sizeClass,
            "mt-3 mb-1.5 text-gray-900 dark:text-gray-100",
          )}
        >
          {parseInline(content, citations, onCitationClick)}
        </Tag>,
      );
      i++;
      continue;
    }

    // 6. Bullet list item: - or * (with nesting support)
    if (/^\s*[-*]\s/.test(line)) {
      const listItems: NestedListItem[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i]!)) {
        const raw = lines[i]!;
        const indentMatch = raw.match(/^(\s*)[-*]\s/)!;
        const depth = Math.floor(indentMatch[1]!.length / 2);
        const itemText = raw.replace(/^\s*[-*]\s/, "");
        listItems.push({ depth, text: itemText });
        i++;
      }

      const baseDepth = listItems[0]!.depth;

      nodes.push(
        <ul key={`ul-${i}`} className="my-1.5 ml-4 space-y-0.5 list-disc">
          {renderNestedList(
            listItems,
            baseDepth,
            citations,
            onCitationClick,
            `ul-${i}`,
          )}
        </ul>,
      );
      continue;
    }

    // 7. Numbered list item: 1. or 1)
    if (/^\s*\d+[.)]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length) {
        const cur = lines[i]!;
        if (/^\s*\d+[.)]\s/.test(cur)) {
          listItems.push(cur.replace(/^\s*\d+[.)]\s/, ""));
          i++;
          continue;
        }
        // Allow blank lines between numbered items, but only if another
        // numbered item follows. Otherwise the blanks belong to whatever
        // comes next.
        if (cur.trim() === "") {
          let j = i + 1;
          while (j < lines.length && lines[j]!.trim() === "") j++;
          if (j < lines.length && /^\s*\d+[.)]\s/.test(lines[j]!)) {
            i = j;
            continue;
          }
        }
        break;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="my-1.5 ml-4 space-y-0.5 list-decimal">
          {listItems.map((item, idx) => (
            <li
              key={idx}
              className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed"
            >
              {parseInline(item, citations, onCitationClick)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // 8. Empty line -> line break
    if (line.trim() === "") {
      nodes.push(<br key={`br-${i}`} />);
      i++;
      continue;
    }

    // 9. Regular paragraph
    nodes.push(
      <p
        key={`p-${i}`}
        className="text-sm leading-relaxed text-gray-700 dark:text-gray-300"
      >
        {parseInline(line, citations, onCitationClick)}
      </p>,
    );
    i++;
  }

  return nodes;
}
