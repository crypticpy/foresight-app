/**
 * The styled component map passed to `react-markdown` so the brief
 * body picks up the app's typography + dark-mode tokens. Kept in a
 * standalone module so `BriefContent` stays focused on layout.
 *
 * @module components/kanban/BriefPreviewModal/markdownComponents
 */

import type { Components } from "react-markdown";

export const briefMarkdownComponents: Components = {
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      className="text-brand-blue hover:text-brand-dark-blue dark:text-brand-light-blue underline"
      target="_blank"
      rel="noopener noreferrer"
    />
  ),
  h1: ({ node: _node, ...props }) => (
    <h1
      {...props}
      className="text-xl font-bold text-gray-900 dark:text-white mt-4 mb-3 first:mt-0"
    />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2
      {...props}
      className="text-lg font-semibold text-gray-900 dark:text-white mt-4 mb-2"
    />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3
      {...props}
      className="text-base font-semibold text-gray-800 dark:text-gray-100 mt-3 mb-2"
    />
  ),
  h4: ({ node: _node, ...props }) => (
    <h4
      {...props}
      className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1"
    />
  ),
  p: ({ node: _node, ...props }) => (
    <p
      {...props}
      className="text-gray-700 dark:text-gray-300 mb-3 text-sm leading-relaxed"
    />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul {...props} className="list-disc list-outside ml-4 mb-3 space-y-1" />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol {...props} className="list-decimal list-outside ml-4 mb-3 space-y-1" />
  ),
  li: ({ node: _node, ...props }) => (
    <li {...props} className="text-gray-700 dark:text-gray-300 text-sm" />
  ),
  code: ({ node: _node, className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          {...props}
          className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs font-mono"
        >
          {children}
        </code>
      );
    }
    return (
      <code {...props} className={className}>
        {children}
      </code>
    );
  },
  pre: ({ node: _node, ...props }) => (
    <pre
      {...props}
      className="bg-gray-200 dark:bg-gray-700 rounded-md p-3 overflow-x-auto text-xs"
    />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      {...props}
      className="border-l-4 border-brand-blue pl-4 italic text-gray-600 dark:text-gray-400 my-3 text-sm"
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto my-3">
      <table
        {...props}
        className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm"
      />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th
      {...props}
      className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-700"
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td
      {...props}
      className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700"
    />
  ),
  hr: ({ node: _node, ...props }) => (
    <hr {...props} className="my-4 border-gray-200 dark:border-gray-700" />
  ),
  strong: ({ node: _node, ...props }) => (
    <strong
      {...props}
      className="font-semibold text-gray-900 dark:text-white"
    />
  ),
  em: ({ node: _node, ...props }) => <em {...props} className="italic" />,
};
