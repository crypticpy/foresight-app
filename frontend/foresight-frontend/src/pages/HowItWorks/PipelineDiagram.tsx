/**
 * Animated 6-stage conveyor (Fetch → Triage → Embed → Classify → Score →
 * Card) plus a 3-up explainer grid below it. Auto-cycles the active stage
 * once the diagram is in view.
 *
 * @module pages/HowItWorks/PipelineDiagram
 */

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Filter,
  Gauge,
  Hash,
  Layers,
  Radio,
  Rss,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useReveal } from "./helpers";

export function PipelineDiagram() {
  const stages = [
    { icon: Rss, label: "Fetch" },
    { icon: Filter, label: "Triage" },
    { icon: Hash, label: "Embed" },
    { icon: Layers, label: "Classify" },
    { icon: Gauge, label: "Score" },
    { icon: Radio, label: "Card" },
  ];
  const [active, setActive] = useState(0);
  const { ref, visible } = useReveal<HTMLDivElement>(0.25);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setActive((a) => (a + 1) % stages.length);
    }, 1400);
    return () => clearInterval(id);
  }, [visible, stages.length]);

  return (
    <div
      ref={ref}
      className="relative bg-gradient-to-br from-brand-blue/5 via-transparent to-brand-green/5 dark:from-brand-blue/10 dark:to-brand-green/10 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 md:p-10 overflow-hidden"
    >
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-2 relative z-10">
        {stages.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === active;
          return (
            <div
              key={s.label}
              className="flex flex-col items-center text-center"
            >
              <div
                className={cn(
                  "relative h-14 w-14 md:h-16 md:w-16 rounded-2xl flex items-center justify-center border shadow-sm transition-all duration-500",
                  isActive
                    ? "bg-brand-blue border-brand-blue scale-110 shadow-lg shadow-brand-blue/30"
                    : "bg-white dark:bg-dark-surface border-gray-200 dark:border-gray-700",
                )}
              >
                {isActive && (
                  <span className="absolute inset-0 rounded-2xl ring-4 ring-brand-blue/30 animate-ping" />
                )}
                <Icon
                  className={cn(
                    "h-6 w-6 transition-colors duration-300",
                    isActive ? "text-white" : "text-brand-blue",
                  )}
                />
                <span
                  className={cn(
                    "absolute -top-2 -left-2 h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors duration-300",
                    isActive
                      ? "bg-white text-brand-blue"
                      : "bg-brand-blue text-white",
                  )}
                >
                  {i + 1}
                </span>
              </div>
              <div
                className={cn(
                  "mt-2 text-xs font-semibold transition-colors duration-300",
                  isActive
                    ? "text-brand-blue dark:text-white"
                    : "text-gray-700 dark:text-gray-200",
                )}
              >
                {s.label}
              </div>
              {i < stages.length - 1 && (
                <ArrowRight className="hidden md:block absolute h-4 w-4 text-brand-blue/50 mt-7 ml-[5.5rem] pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="rounded-lg p-4 bg-white/60 dark:bg-dark-surface/60">
          <div className="font-semibold text-gray-900 dark:text-white mb-1">
            Fetch &amp; Triage
          </div>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            RSS feeds, NewsAPI, and curated sources stream in continuously. A
            triage layer drops anything off-topic before any AI cost is spent.
          </p>
        </div>
        <div className="rounded-lg p-4 bg-white/60 dark:bg-dark-surface/60">
          <div className="font-semibold text-gray-900 dark:text-white mb-1">
            Embed &amp; Dedup
          </div>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            Each item becomes a 1,536-dim semantic vector. New items above 0.92
            similarity to an existing card merge in as additional sources, not
            duplicates.
          </p>
        </div>
        <div className="rounded-lg p-4 bg-white/60 dark:bg-dark-surface/60">
          <div className="font-semibold text-gray-900 dark:text-white mb-1">
            Classify &amp; Score
          </div>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            GPT-5.4-mini assigns pillar, maturity stage, and time horizon, then
            scores on six independent factors so analysts can sort by what
            matters today.
          </p>
        </div>
      </div>
    </div>
  );
}
