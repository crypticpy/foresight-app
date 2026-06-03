/**
 * Foresight guide hub — a single landing page that links to every in-app
 * how-to guide plus the deeper "how it works" and methodology references.
 * Surfaced from the top-level "Help" nav item so non-technical users have one
 * front door to all learning content instead of hunting through a dropdown.
 *
 * @module pages/GuideHub
 */

import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Compass,
  FolderOpen,
  GraduationCap,
  type LucideIcon,
  Radio,
  Sparkles,
  Wand2,
} from "lucide-react";

interface GuideLink {
  name: string;
  href: string;
  icon: LucideIcon;
  description: string;
  accent: string;
}

const HOW_TO_GUIDES: GuideLink[] = [
  {
    name: "Ask Foresight",
    href: "/guide/chat",
    icon: Sparkles,
    description:
      "Ask questions in plain English and get cited answers drawn from your intelligence library.",
    accent: "text-brand-blue dark:text-brand-light-blue",
  },
  {
    name: "Signals",
    href: "/guide/signals",
    icon: Radio,
    description:
      "Track, organize, tag, and discuss the signals that matter most to your work.",
    accent: "text-brand-green",
  },
  {
    name: "Discover",
    href: "/guide/discover",
    icon: Compass,
    description:
      "Browse and triage AI-curated signals across Austin's strategic pillars.",
    accent: "text-brand-blue dark:text-brand-light-blue",
  },
  {
    name: "Workstreams",
    href: "/guide/workstreams",
    icon: FolderOpen,
    description:
      "Run deep research, manage the Kanban board, and build leadership-ready briefs.",
    accent: "text-brand-green",
  },
];

const GO_DEEPER: GuideLink[] = [
  {
    name: "How It Works",
    href: "/how-it-works",
    icon: Wand2,
    description:
      "A look under the hood at the AI pipeline that powers discovery, search, and briefs.",
    accent: "text-brand-blue dark:text-brand-light-blue",
  },
  {
    name: "Methodology",
    href: "/methodology",
    icon: BookOpen,
    description:
      "The strategic framework, scoring factors, and horizon model Foresight is built on.",
    accent: "text-brand-green",
  },
];

function GuideCard({ guide }: { guide: GuideLink }) {
  const Icon = guide.icon;
  return (
    <Link
      to={guide.href}
      className="group flex items-start gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-brand-blue/30"
    >
      <div className="w-10 h-10 rounded-lg bg-brand-blue/10 dark:bg-brand-blue/20 flex items-center justify-center flex-shrink-0">
        <Icon className={`h-5 w-5 ${guide.accent}`} />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          {guide.name}
          <ArrowRight className="h-4 w-4 text-gray-400 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
          {guide.description}
        </p>
      </div>
    </Link>
  );
}

export default function GuideHub() {
  return (
    <div className="min-h-screen bg-brand-faded-white dark:bg-brand-dark-blue">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-r from-brand-blue via-brand-blue/90 to-brand-green">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Foresight Guides
            </h1>
          </div>
          <p className="text-white/80 text-lg max-w-2xl leading-relaxed">
            Everything you need to get the most out of Foresight. New here?
            Start with Ask Foresight, then explore Signals and Workstreams at
            your own pace.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            How-to guides
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
            Step-by-step walkthroughs of the core Foresight workflow.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {HOW_TO_GUIDES.map((guide) => (
              <GuideCard key={guide.href} guide={guide} />
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            Go deeper
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
            Understand the system and the strategic thinking behind it.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {GO_DEEPER.map((guide) => (
              <GuideCard key={guide.href} guide={guide} />
            ))}
          </div>
        </section>

        <p className="mt-12 text-sm text-gray-400 dark:text-gray-500 text-center">
          Still stuck? Reach out to the Foresight team &mdash; we're happy to
          help.
        </p>
      </div>
    </div>
  );
}
