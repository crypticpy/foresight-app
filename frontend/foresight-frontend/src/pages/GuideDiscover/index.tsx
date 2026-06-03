/**
 * Composer for the Discover guide page. Renders the hero, an interactive
 * four-up Quick Start row, nine accordion sections, and the footer CTA.
 *
 * The page was previously a 1683 LOC monolith. State that belongs to a
 * single section (filter expander, score expander) now lives inside that
 * section's component. Only the Quick Start active-card state remains here
 * because it spans four sibling cards.
 *
 * @module pages/GuideDiscover
 */

import { useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Compass,
  Eye,
  Filter,
  Layers,
  Search,
  Star,
} from "lucide-react";
import { GuideFigure } from "@/components/GuideFigure";
import { QuickStartCard } from "./QuickStartCard";
import { Library } from "./sections/Library";
import { SearchAndAI } from "./sections/SearchAndAI";
import { FilteringYourView } from "./sections/FilteringYourView";
import { WorkingWithSignals } from "./sections/WorkingWithSignals";
import { SavedSearches } from "./sections/SavedSearches";
import { DiscoveryPipeline } from "./sections/DiscoveryPipeline";
import { ScoreDimensions } from "./sections/ScoreDimensions";
import { ReviewQueueRunHistory } from "./sections/ReviewQueueRunHistory";
import { DiscoveryToAction } from "./sections/DiscoveryToAction";

const QUICK_START_STEPS = [
  {
    step: 1,
    title: "Browse",
    description: "Open the Discover page and scan the signal grid.",
    detail:
      "The Discover page loads all published signals in a virtual grid. Scroll through to explore, or switch to list view for a denser layout. New and recently updated signals are highlighted.",
    icon: <Eye className="h-5 w-5" />,
  },
  {
    step: 2,
    title: "Search",
    description: "Use text or AI-powered semantic search.",
    detail:
      "Type keywords in the search bar for fast text matching. Toggle the AI Search switch for vector-based semantic search that finds conceptually related signals -- even when exact terms do not appear.",
    icon: <Search className="h-5 w-5" />,
  },
  {
    step: 3,
    title: "Filter",
    description: "Narrow results by pillar, horizon, stage, and scores.",
    detail:
      "Apply multi-dimensional filters to focus on exactly what matters to you. Combine strategic pillars, time horizons, maturity stages, score thresholds, quality tiers, and date ranges for precision results.",
    icon: <Filter className="h-5 w-5" />,
  },
  {
    step: 4,
    title: "Follow",
    description: "Follow signals to build your watchlist.",
    detail:
      "Click the star icon on any signal card to add it to your personal watchlist on the My Signals page. Followed signals surface updates and can be organized into research workstreams.",
    icon: <Star className="h-5 w-5" />,
  },
];

export default function GuideDiscover() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <>
      <style>{`
        @media print {
          [data-state="closed"] > [role="region"] {
            display: block !important;
            height: auto !important;
          }
          [data-radix-collection-item] svg.lucide-chevron-down {
            display: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-brand-faded-white dark:bg-brand-dark-blue">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-brand-blue via-brand-blue/90 to-brand-green">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <Link
              to="/discover"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white/80 hover:text-white transition-colors mb-6 no-print"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Discover
            </Link>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <Compass className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                How to Use Discover
              </h1>
            </div>
            <p className="text-lg text-white/85 max-w-2xl leading-relaxed">
              Your guide to exploring Foresight's intelligence library -- from
              searching and filtering signals to building your personal
              watchlist and turning insights into action.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <GuideFigure
            src="/guide/discover-feed.png"
            alt="The Discover page showing the search and filter panel above a grid of AI-curated signal cards across Austin's strategic pillars."
            caption="The Discover feed — AI-curated signals you can search semantically, filter by pillar and score, and follow to build your watchlist."
            className="mt-0 mb-14"
            eager
          />

          {/* Quick Start */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Quick Start
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Four steps to get the most from the intelligence library. Click
              each step to learn more.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {QUICK_START_STEPS.map((s, idx) => (
                <QuickStartCard
                  key={s.step}
                  step={s.step}
                  title={s.title}
                  description={s.description}
                  detail={s.detail}
                  icon={s.icon}
                  isActive={activeStep === idx}
                  onClick={() => setActiveStep(activeStep === idx ? -1 : idx)}
                />
              ))}
            </div>
          </section>

          {/* Accordion Sections */}
          <Accordion.Root
            type="multiple"
            defaultValue={[]}
            className="divide-y divide-gray-200 dark:divide-gray-700 border-t border-b border-gray-200 dark:border-gray-700"
          >
            <Library />
            <SearchAndAI />
            <FilteringYourView />
            <WorkingWithSignals />
            <SavedSearches />
            <DiscoveryPipeline />
            <ScoreDimensions />
            <ReviewQueueRunHistory />
            <DiscoveryToAction />
          </Accordion.Root>

          {/* Footer CTA */}
          <section className="mt-14 no-print">
            <div className="rounded-xl border border-brand-blue/20 bg-gradient-to-r from-brand-blue/10 to-brand-green/10 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Continue Learning
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                Explore the other guide pages to master the complete Foresight
                workflow.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <Link
                  to="/guide/signals"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-brand-blue/30"
                >
                  <Star className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      How to Use Signals
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Manage your followed signals
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </Link>
                <Link
                  to="/guide/workstreams"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-brand-blue/30"
                >
                  <Layers className="h-5 w-5 text-brand-green flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      How to Use Workstreams
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Deep research and collaboration
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </Link>
                <Link
                  to="/"
                  className="flex items-center gap-3 rounded-lg border border-brand-blue/30 bg-brand-blue/5 dark:bg-brand-blue/10 p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                >
                  <BarChart3 className="h-5 w-5 text-brand-blue dark:text-brand-light-blue flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      Dashboard
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      View your overview and metrics
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </Link>
              </div>
            </div>
          </section>

          <p className="mt-10 text-sm text-gray-400 dark:text-gray-500 text-center no-print">
            Questions about using Discover? Reach out to the Foresight team.
          </p>
        </div>
      </div>
    </>
  );
}
