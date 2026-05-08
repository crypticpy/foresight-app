/**
 * Builds the `CommandAction[]` consumed by the Dashboard's ⌘K palette.
 *
 * Lives outside the page component so it can be unit-tested without
 * mounting the dashboard, and so the action set is easy to audit in
 * isolation. Pass in `navigate` (from `useNavigate()`) and a refresh
 * callback; the builder wires them onto the action list.
 */

import type { NavigateFunction } from "react-router-dom";
import {
  BookOpen,
  Compass,
  Inbox,
  Layers,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import type { CommandAction } from "../components/CommandPalette";

export function buildDashboardCommandActions(
  navigate: NavigateFunction,
  handleRefresh: () => Promise<void> | void,
): CommandAction[] {
  return [
    {
      id: "go-discover",
      name: "Go to Discover",
      description: "Browse the signal feed",
      keywords: ["search", "feed", "signals"],
      icon: Compass,
      onActivate: () => navigate("/discover"),
    },
    {
      id: "go-discovery-queue",
      name: "Go to Discovery Queue",
      description: "Review pending discoveries",
      keywords: ["pending", "review", "triage"],
      icon: Inbox,
      onActivate: () => navigate("/discover/queue"),
    },
    {
      id: "go-workstreams",
      name: "Go to Workstreams",
      description: "Open your research streams",
      keywords: ["projects", "research"],
      icon: Layers,
      onActivate: () => navigate("/workstreams"),
    },
    {
      id: "go-portfolios",
      name: "Go to Portfolios",
      description: "Curated card collections",
      keywords: ["collections", "decks", "export"],
      icon: BookOpen,
      onActivate: () => navigate("/portfolios"),
    },
    {
      id: "ask-foresight",
      name: "Ask Foresight",
      description: "Open the global chat",
      keywords: ["chat", "search", "question"],
      icon: MessageSquare,
      onActivate: () => navigate("/ask"),
    },
    {
      id: "go-methodology",
      name: "How does Foresight work?",
      description: "Read the methodology page",
      keywords: ["help", "docs", "explain"],
      icon: BookOpen,
      onActivate: () => navigate("/methodology"),
    },
    {
      id: "refresh-dashboard",
      name: "Refresh dashboard",
      description: "Reload stats, follows, and the lens overview",
      keywords: ["reload", "update"],
      icon: RefreshCw,
      onActivate: () => {
        void handleRefresh();
      },
    },
  ];
}
