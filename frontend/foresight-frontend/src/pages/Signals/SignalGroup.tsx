/**
 * Collapsible group wrapper used when `groupBy` is active. Hosts either a
 * `VirtualizedGrid` of `SignalCard`s or a `VirtualizedList` of
 * `SignalListItem`s, with a viewport-capped container height.
 *
 * @module pages/Signals/SignalGroup
 */

import { useCallback, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { HorizonBadge } from "../../components/HorizonBadge";
import { PillarBadge } from "../../components/PillarBadge";
import { VirtualizedGrid } from "../../components/VirtualizedGrid";
import { VirtualizedList } from "../../components/VirtualizedList";
import type { TagOnCard } from "../../lib/tags-api";
import { SignalCard } from "./SignalCard";
import { SignalListItem } from "./SignalListItem";
import type { GroupBy, PersonalSignal, ViewMode } from "./types";

interface SignalGroupProps {
  label: string;
  groupBy: GroupBy;
  signals: PersonalSignal[];
  viewMode: ViewMode;
  onTogglePin: (cardId: string, currentlyPinned: boolean) => void;
  tagsByCard?: Record<string, TagOnCard[]>;
}

export function SignalGroup({
  label,
  groupBy,
  signals,
  viewMode,
  onTogglePin,
  tagsByCard,
}: SignalGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  const renderGridItem = useCallback(
    (signal: PersonalSignal, _index: number) => (
      <div className="h-full">
        <SignalCard
          signal={signal}
          onTogglePin={onTogglePin}
          tags={tagsByCard?.[signal.id]}
        />
      </div>
    ),
    [onTogglePin, tagsByCard],
  );

  const renderListItem = useCallback(
    (signal: PersonalSignal) => (
      <SignalListItem signal={signal} onTogglePin={onTogglePin} />
    ),
    [onTogglePin],
  );

  const getItemKey = useCallback((signal: PersonalSignal) => signal.id, []);

  // Compute a dynamic height for the virtualized container based on item count.
  // Grid: 3 cards per row (lg), ~304px per row (280 + 24 gap).
  // List: ~112px per item (100 + 12 gap).
  // Cap at viewport height - 300 so the page doesn't grow unbounded.
  const containerHeight = useMemo(() => {
    if (viewMode === "grid") {
      const rowCount = Math.ceil(signals.length / 3);
      const totalHeight = rowCount * (280 + 24);
      return Math.min(totalHeight, window.innerHeight - 300);
    }
    const totalHeight = signals.length * (100 + 12);
    return Math.min(totalHeight, window.innerHeight - 300);
  }, [signals.length, viewMode]);

  return (
    <div>
      {groupBy !== "none" && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 mb-3 group w-full text-left"
        >
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${
              collapsed ? "-rotate-90" : ""
            }`}
          />
          {groupBy === "pillar" ? (
            <PillarBadge pillarId={label} size="sm" disableTooltip />
          ) : groupBy === "horizon" &&
            (label === "H1" || label === "H2" || label === "H3") ? (
            <HorizonBadge horizon={label} size="sm" disableTooltip />
          ) : (
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {label}
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ({signals.length})
          </span>
        </button>
      )}

      {!collapsed &&
        (viewMode === "grid" ? (
          <div style={{ height: `${Math.max(containerHeight, 400)}px` }}>
            <VirtualizedGrid<PersonalSignal>
              items={signals}
              getItemKey={getItemKey}
              estimatedRowHeight={280}
              gap={24}
              columns={{ sm: 1, md: 2, lg: 3 }}
              overscan={3}
              renderItem={renderGridItem}
            />
          </div>
        ) : (
          <div style={{ height: `${Math.max(containerHeight, 400)}px` }}>
            <VirtualizedList<PersonalSignal>
              items={signals}
              renderItem={renderListItem}
              getItemKey={getItemKey}
              estimatedSize={100}
              gap={12}
              overscan={5}
              scrollContainerClassName="h-full"
              ariaLabel="Signals list"
            />
          </div>
        ))}
    </div>
  );
}
