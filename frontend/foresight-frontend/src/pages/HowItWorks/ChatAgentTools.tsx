/**
 * Static catalog of the chat agent's read & write tools, rendered as a
 * 2-column grid of name + description chips.
 *
 * @module pages/HowItWorks/ChatAgentTools
 */

import {
  Bookmark,
  Brain,
  Compass,
  Globe,
  Layers,
  Pin,
  Radio,
  Search,
} from "lucide-react";
import { cn } from "../../lib/utils";

export function ChatAgentTools() {
  const tools = [
    {
      icon: Globe,
      name: "web_search",
      desc: "Live web search via Tavily for breaking developments",
      kind: "Read",
    },
    {
      icon: Radio,
      name: "get_card_details",
      desc: "Fetch a signal's full content, sources, and scores by slug",
      kind: "Read",
    },
    {
      icon: Search,
      name: "search_signals",
      desc: "Hybrid search across the library — defaults to current scope, can override",
      kind: "Read",
    },
    {
      icon: Compass,
      name: "list_workstreams",
      desc: "Show the user's research streams with progress",
      kind: "Read",
    },
    {
      icon: Layers,
      name: "get_workstream",
      desc: "Open a workstream's cards and kanban state",
      kind: "Read",
    },
    {
      icon: Brain,
      name: "list_patterns",
      desc: "Surface AI-detected cross-signal patterns",
      kind: "Read",
    },
    {
      icon: Bookmark,
      name: "follow_signal",
      desc: "Subscribe the user to updates on a signal",
      kind: "Write",
    },
    {
      icon: Bookmark,
      name: "unfollow_signal",
      desc: "Reverse a follow",
      kind: "Write",
    },
    {
      icon: Pin,
      name: "pin_signal",
      desc: "Pin a signal to the user's prioritized list",
      kind: "Write",
    },
    {
      icon: Pin,
      name: "unpin_signal",
      desc: "Reverse a pin",
      kind: "Write",
    },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {tools.map((t) => {
        const Icon = t.icon;
        const isWrite = t.kind === "Write";
        return (
          <div
            key={t.name}
            className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4"
          >
            <div
              className={cn(
                "p-2 rounded-lg shrink-0",
                isWrite
                  ? "bg-brand-green/10 text-brand-green"
                  : "bg-brand-blue/10 text-brand-blue",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t.name}
                </code>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider",
                    isWrite
                      ? "bg-brand-green/10 text-brand-green"
                      : "bg-gray-100 dark:bg-dark-surface-deep text-gray-600 dark:text-gray-400",
                  )}
                >
                  {t.kind}
                </span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                {t.desc}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
