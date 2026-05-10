/**
 * Three weak signals slide in from the left, a "cluster" pulse fires in the
 * middle, and the synthesised pattern card slides in from the right —
 * driven by `useReveal` so the choreography fires once when the section
 * enters the viewport.
 *
 * @module pages/HowItWorks/PatternIllustration
 */

import { ArrowRight, Brain, Network } from "lucide-react";
import { cn } from "../../lib/utils";
import { useReveal } from "./helpers";

export function PatternIllustration() {
  const { ref, visible } = useReveal<HTMLDivElement>(0.3);
  return (
    <div
      ref={ref}
      className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6 md:p-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-center">
        <div className="md:col-span-3 space-y-2">
          {[
            "Rural EV charging gap",
            "Battery recycling startup launches",
            "TxDOT grant program for fleets",
          ].map((t, i) => (
            <div
              key={t}
              className={cn(
                "rounded-lg p-3 bg-gray-50 dark:bg-dark-surface-deep border border-gray-200 dark:border-gray-700 text-xs transition-all duration-700 ease-out",
                visible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-6",
              )}
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              <div className="text-[10px] uppercase tracking-wider text-brand-blue font-semibold mb-0.5">
                Weak signal
              </div>
              <div className="font-semibold text-gray-900 dark:text-white">
                {t}
              </div>
            </div>
          ))}
        </div>
        <div className="md:col-span-1 flex items-center justify-center">
          <div
            className={cn(
              "hidden md:flex flex-col items-center text-brand-blue transition-all duration-700",
              visible ? "opacity-100 scale-100" : "opacity-0 scale-50",
            )}
            style={{ transitionDelay: "500ms" }}
          >
            <Network className="h-8 w-8 animate-pulse" />
            <span className="text-[10px] mt-1 uppercase tracking-wider">
              Cluster
            </span>
          </div>
          <div className="md:hidden flex items-center text-brand-blue">
            <ArrowRight className="h-6 w-6 rotate-90" />
          </div>
        </div>
        <div
          className={cn(
            "md:col-span-3 rounded-xl p-4 bg-gradient-to-br from-brand-blue/10 to-brand-green/10 border border-brand-blue/20 transition-all duration-700 ease-out",
            visible
              ? "opacity-100 translate-x-0 scale-100"
              : "opacity-0 translate-x-6 scale-95",
          )}
          style={{ transitionDelay: "700ms" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-4 w-4 text-brand-blue" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-blue">
              Pattern
            </span>
          </div>
          <div className="font-bold text-sm text-gray-900 dark:text-white mb-1">
            Statewide EV transition is bottlenecked at the regional grid
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-300">
            Three independent signals across mobility, environment, and economy
            point to the same chokepoint — a pattern no single article would
            surface alone.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
              Notable
            </span>
            <span className="text-[10px] text-gray-500">Confidence 0.78</span>
          </div>
        </div>
      </div>
    </div>
  );
}
