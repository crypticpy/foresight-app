import { BookText, Compass, Loader2, Microscope } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../lib/utils";
import { Tooltip } from "./ui/Tooltip";
import type { CardArtifacts } from "../types/card";

type ArtifactType = "deep" | "brief" | "scan";

interface ArtifactItem {
  type: ArtifactType;
  label: string;
  updatedAt?: string | null;
  icon: typeof Microscope;
}

function relativeDate(value?: string | null): string {
  if (!value) return "";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return "";
  }
}

function getItems(artifacts?: CardArtifacts | null): ArtifactItem[] {
  if (!artifacts) return [];
  const items: ArtifactItem[] = [];
  if (artifacts.has_deep_research || artifacts.pending_research) {
    items.push({
      type: "deep",
      label: artifacts.pending_research ? "Researching" : "Deep Dive",
      updatedAt: artifacts.deep_research_updated_at,
      icon: Microscope,
    });
  }
  if (artifacts.has_brief) {
    items.push({
      type: "brief",
      label: "Brief",
      updatedAt: artifacts.brief_updated_at,
      icon: BookText,
    });
  }
  if (artifacts.has_scan) {
    items.push({
      type: "scan",
      label: "Scan",
      updatedAt: artifacts.scan_updated_at,
      icon: Compass,
    });
  }
  return items;
}

function tooltipContent(items: ArtifactItem[]) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const date = relativeDate(item.updatedAt);
        return (
          <div key={item.type} className="flex items-center gap-2 text-xs">
            <item.icon className="h-3.5 w-3.5 text-brand-green" />
            <span className="font-medium">{item.label}</span>
            {date && <span className="text-gray-500">{date}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ArtifactRibbon({
  artifacts,
  hideDeepResearch = false,
  className,
}: {
  artifacts?: CardArtifacts | null;
  hideDeepResearch?: boolean;
  className?: string;
}) {
  const items = getItems(artifacts).filter(
    (item) => !(hideDeepResearch && item.type === "deep"),
  );
  if (items.length === 0) return null;
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;

  return (
    <Tooltip content={tooltipContent(items)} side="top">
      <div
        role="img"
        aria-label="Generated artifacts available"
        className={cn(
          // pointer-events-none keeps the absolutely-positioned ribbon
          // from swallowing clicks meant for the card link beneath it.
          // The Tooltip wrapper still gets hover events because it sits
          // above this element in the DOM.
          "pointer-events-none absolute top-2 right-2 z-10 inline-flex h-6 items-center gap-1 rounded-md border border-gray-200 bg-white/90 px-1.5 text-brand-green shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-dark-surface/90",
          className,
        )}
      >
        {visible.map((item) =>
          artifacts?.pending_research && item.type === "deep" ? (
            <Loader2 key={item.type} className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <item.icon key={item.type} className="h-3.5 w-3.5" />
          ),
        )}
        {extra > 0 && (
          <span className="text-[10px] font-semibold">+{extra}</span>
        )}
      </div>
    </Tooltip>
  );
}

export function ArtifactFolderTab({
  visible,
  className,
}: {
  visible?: boolean;
  className?: string;
}) {
  if (!visible) return null;
  return (
    <div
      role="img"
      aria-label="Deep dive research available"
      className={cn(
        "pointer-events-none absolute right-4 -top-4 z-10 inline-flex items-center gap-1 rounded-t-md bg-brand-green px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-transform group-hover:scale-105",
        className,
      )}
    >
      <Microscope className="h-3 w-3" />
      Deep Dive
    </div>
  );
}

export function ArtifactChips({
  artifacts,
  onSelect,
}: {
  artifacts?: CardArtifacts | null;
  onSelect?: (type: ArtifactType) => void;
}) {
  const items = getItems(artifacts);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const date = relativeDate(item.updatedAt);
        const pending = artifacts?.pending_research && item.type === "deep";
        return (
          <button
            key={item.type}
            type="button"
            onClick={() => onSelect?.(item.type)}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-green/25 bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-green transition-colors hover:bg-brand-green hover:text-white"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <item.icon className="h-3.5 w-3.5" />
            )}
            <span>{pending ? "Researching..." : item.label}</span>
            {!pending && date && <span className="opacity-80">- {date}</span>}
          </button>
        );
      })}
    </div>
  );
}
