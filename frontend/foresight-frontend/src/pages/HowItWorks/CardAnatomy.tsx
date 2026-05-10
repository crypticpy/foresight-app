/**
 * Hover-to-explain card mock: three labels on each side of a sample signal
 * card; hovering a label rings the matching region (title, pillar, stage,
 * horizon, scores, summary) on the card.
 *
 * @module pages/HowItWorks/CardAnatomy
 */

import { useState } from "react";
import { cn } from "../../lib/utils";

type Part =
  | "title"
  | "pillar"
  | "stage"
  | "horizon"
  | "scores"
  | "summary"
  | null;

export function CardAnatomy() {
  const [hovered, setHovered] = useState<Part>(null);

  const Anno = ({
    label,
    desc,
    part,
    side = "left" as "left" | "right",
  }: {
    label: string;
    desc: string;
    part: Exclude<Part, null>;
    side?: "left" | "right";
  }) => {
    const isActive = hovered === part;
    return (
      <div
        onMouseEnter={() => setHovered(part)}
        onMouseLeave={() => setHovered(null)}
        className={cn(
          "flex items-center gap-2 text-xs cursor-pointer transition-all duration-200",
          side === "right" && "flex-row-reverse text-right",
          isActive ? "scale-[1.02]" : "opacity-90",
        )}
      >
        <div
          className={cn(
            "h-px transition-all duration-200",
            isActive ? "w-12 bg-brand-blue" : "w-6 bg-brand-blue/40",
          )}
        />
        <div>
          <div
            className={cn(
              "font-semibold transition-colors",
              isActive
                ? "text-brand-blue dark:text-brand-blue"
                : "text-gray-900 dark:text-white",
            )}
          >
            {label}
          </div>
          <div className="text-gray-500 dark:text-gray-400">{desc}</div>
        </div>
      </div>
    );
  };

  const ring = (part: Exclude<Part, null>) =>
    hovered === part
      ? "ring-2 ring-brand-blue ring-offset-2 ring-offset-white dark:ring-offset-dark-surface rounded"
      : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
      <div className="hidden lg:flex flex-col gap-6">
        <Anno
          label="Title + slug"
          desc="Stable URL across renames"
          part="title"
        />
        <Anno
          label="Strategic pillar"
          desc="One of six city priorities"
          part="pillar"
        />
        <Anno
          label="Maturity stage"
          desc="Concept → Mature → Declining"
          part="stage"
        />
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface shadow-sm p-5 transition-shadow hover:shadow-md">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue transition-all",
              ring("pillar"),
            )}
          >
            Mobility
          </span>
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green transition-all",
              ring("stage"),
            )}
          >
            Pilot
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider text-gray-500 px-1 transition-all",
              ring("horizon"),
            )}
          >
            2y horizon
          </span>
        </div>
        <h3
          className={cn(
            "font-bold text-gray-900 dark:text-white mb-1 transition-all",
            ring("title"),
          )}
        >
          Autonomous shuttle pilots accelerate
        </h3>
        <p
          className={cn(
            "text-xs text-gray-600 dark:text-gray-400 mb-4 transition-all",
            ring("summary"),
          )}
        >
          Multiple municipalities are graduating low-speed AV shuttles from
          closed-loop demos to mixed-traffic pilots…
        </p>
        <div
          className={cn(
            "grid grid-cols-3 gap-2 text-[10px] transition-all p-1",
            ring("scores"),
          )}
        >
          {[
            { label: "Impact", val: 84 },
            { label: "Relevance", val: 91 },
            { label: "Velocity", val: 67 },
            { label: "Novelty", val: 58 },
            { label: "Opportunity", val: 79 },
            { label: "Risk", val: 42 },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>{s.label}</span>
                <span className="tabular-nums font-semibold text-gray-700 dark:text-gray-200">
                  {s.val}
                </span>
              </div>
              <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 mt-0.5">
                <div
                  className="h-1 rounded-full bg-brand-blue"
                  style={{ width: `${s.val}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden lg:flex flex-col gap-6">
        <Anno
          label="Six-factor score"
          desc="Impact, Relevance, Velocity, Novelty, Opportunity, Risk"
          part="scores"
          side="right"
        />
        <Anno
          label="Time horizon"
          desc="When this matters: now, 1y, 2y, 5y+"
          part="horizon"
          side="right"
        />
        <Anno
          label="Summary + sources"
          desc="Articles dedup into a single card"
          part="summary"
          side="right"
        />
      </div>
      <p className="lg:hidden text-xs text-gray-500 dark:text-gray-400 col-span-1">
        On a wider screen, hover the labels to see how each part of the card
        maps back to the underlying schema.
      </p>
    </div>
  );
}
