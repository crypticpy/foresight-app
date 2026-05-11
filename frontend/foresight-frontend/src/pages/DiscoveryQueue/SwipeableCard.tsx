/**
 * Touch-gesture wrapper for pending-card rows: left-swipe dismisses, right-
 * swipe approves. Uses `@use-gesture/react` for drag detection, renders a
 * direction indicator + colored inset shadow while the user is dragging,
 * and only fires the callback past `SWIPE_CONFIG` thresholds.
 *
 * Memoized with a custom comparator so the parent VirtualizedList can render
 * many rows without thrashing this component; callbacks are expected to be
 * stable (useCallback) at the call site.
 *
 * @module pages/DiscoveryQueue/SwipeableCard
 */

import React, { useCallback, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { CheckCircle, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";

const SWIPE_CONFIG = {
  /** Min swipe distance on touch devices (higher prevents accidental triggers). */
  mobileDistance: 80,
  /** Min swipe distance on pointer devices. */
  desktopDistance: 50,
  /** Min velocity threshold to count as a swipe. */
  velocity: 0.3,
  /** Max angle from horizontal (degrees) to count as a swipe vs scroll. */
  maxAngle: 30,
  /** Offset that starts showing inset-shadow feedback. */
  feedbackThreshold: 25,
  /** Offset that flips visual state to "will trigger". */
  triggerThreshold: 60,
  /** Translate damping factor (0–1) — lower = more resistance. */
  damping: 0.4,
} as const;

export interface SwipeableCardProps {
  cardId: string;
  /** Fired when the card is swiped left past threshold. */
  onSwipeLeft: (cardId: string) => void;
  /** Fired when the card is swiped right past threshold. */
  onSwipeRight: (cardId: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  tabIndex?: number;
  /** Click handler — receives cardId so consumers can keep one stable ref. */
  onClick?: (cardId: string) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  /** When true, applies the higher touch-distance threshold. */
  isMobile?: boolean;
}

/**
 * Custom comparator for `React.memo`: every primitive prop compared by value,
 * every function/object prop compared by reference (callers are expected to
 * stabilize these via `useCallback` / `useMemo`).
 */
function areSwipeableCardPropsEqual(
  prevProps: SwipeableCardProps,
  nextProps: SwipeableCardProps,
): boolean {
  if (prevProps.cardId !== nextProps.cardId) return false;
  if (prevProps.disabled !== nextProps.disabled) return false;
  if (prevProps.className !== nextProps.className) return false;
  if (prevProps.tabIndex !== nextProps.tabIndex) return false;
  if (prevProps.isMobile !== nextProps.isMobile) return false;
  if (prevProps.onSwipeLeft !== nextProps.onSwipeLeft) return false;
  if (prevProps.onSwipeRight !== nextProps.onSwipeRight) return false;
  if (prevProps.onClick !== nextProps.onClick) return false;
  if (prevProps.cardRef !== nextProps.cardRef) return false;
  if (prevProps.style !== nextProps.style) return false;
  if (prevProps.children !== nextProps.children) return false;
  return true;
}

export const SwipeableCard = React.memo(function SwipeableCard({
  cardId,
  onSwipeLeft,
  onSwipeRight,
  disabled = false,
  children,
  className,
  style,
  tabIndex,
  onClick,
  cardRef,
  isMobile = false,
}: SwipeableCardProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(
    null,
  );
  const [willTrigger, setWillTrigger] = useState(false);

  const swipeDistance = isMobile
    ? SWIPE_CONFIG.mobileDistance
    : SWIPE_CONFIG.desktopDistance;

  const bind = useDrag(
    ({
      movement: [mx, my],
      dragging,
      tap,
      velocity: [vx],
      direction: [dx],
    }) => {
      if (tap) return;
      if (disabled) return;

      const absX = Math.abs(mx);
      const absY = Math.abs(my);
      const angle = Math.atan2(absY, absX) * (180 / Math.PI);

      // Reject mostly-vertical gestures so scrolling still works.
      if (
        angle > SWIPE_CONFIG.maxAngle &&
        absX < SWIPE_CONFIG.feedbackThreshold
      ) {
        if (isSwiping) {
          setIsSwiping(false);
          setSwipeOffset(0);
          setSwipeDirection(null);
          setWillTrigger(false);
        }
        return;
      }

      if (dragging) {
        setIsSwiping(true);
        setSwipeOffset(mx);

        if (mx < -SWIPE_CONFIG.feedbackThreshold) {
          setSwipeDirection("left");
          setWillTrigger(Math.abs(mx) >= swipeDistance);
        } else if (mx > SWIPE_CONFIG.feedbackThreshold) {
          setSwipeDirection("right");
          setWillTrigger(mx >= swipeDistance);
        } else {
          setSwipeDirection(null);
          setWillTrigger(false);
        }
        return;
      }

      // Drag ended: reset visual state, then decide whether to fire.
      setIsSwiping(false);
      setSwipeOffset(0);
      setSwipeDirection(null);
      setWillTrigger(false);

      const meetsDistanceThreshold = Math.abs(mx) >= swipeDistance;
      const meetsVelocityThreshold = Math.abs(vx) >= SWIPE_CONFIG.velocity;

      if (meetsDistanceThreshold || meetsVelocityThreshold) {
        if (dx < 0 && mx < 0) {
          onSwipeLeft(cardId);
        } else if (dx > 0 && mx > 0) {
          onSwipeRight(cardId);
        }
      }
    },
    {
      filterTaps: true,
      axis: "lock",
      pointer: { touch: true },
      threshold: 10,
    },
  );

  const swipeStyles: React.CSSProperties = (() => {
    if (!isSwiping || Math.abs(swipeOffset) < SWIPE_CONFIG.feedbackThreshold) {
      return {};
    }

    const progress = Math.min(Math.abs(swipeOffset) / swipeDistance, 1);
    const intensity = progress * 0.4;

    if (swipeOffset < -SWIPE_CONFIG.feedbackThreshold) {
      return {
        boxShadow: willTrigger
          ? `inset -6px 0 0 0 rgba(239, 68, 68, 0.5), 0 0 20px rgba(239, 68, 68, 0.2)`
          : `inset -4px 0 0 0 rgba(239, 68, 68, ${intensity})`,
        backgroundColor: willTrigger ? "rgba(239, 68, 68, 0.05)" : undefined,
      };
    }
    if (swipeOffset > SWIPE_CONFIG.feedbackThreshold) {
      return {
        boxShadow: willTrigger
          ? `inset 6px 0 0 0 rgba(34, 197, 94, 0.5), 0 0 20px rgba(34, 197, 94, 0.2)`
          : `inset 4px 0 0 0 rgba(34, 197, 94, ${intensity})`,
        backgroundColor: willTrigger ? "rgba(34, 197, 94, 0.05)" : undefined,
      };
    }
    return {};
  })();

  const indicatorOpacity = (() => {
    const progress = Math.min(Math.abs(swipeOffset) / swipeDistance, 1);
    return 0.3 + progress * 0.5;
  })();

  const handleClick = useCallback(() => {
    onClick?.(cardId);
  }, [onClick, cardId]);

  return (
    <div
      {...bind()}
      ref={cardRef}
      tabIndex={tabIndex}
      onClick={handleClick}
      className={cn(className, "relative")}
      style={{
        ...style,
        touchAction: "pan-y pinch-zoom",
        transform: isSwiping
          ? `translateX(${swipeOffset * SWIPE_CONFIG.damping}px)`
          : undefined,
        transition: isSwiping
          ? "none"
          : "transform 0.2s ease-out, box-shadow 0.2s ease-out",
        ...swipeStyles,
      }}
    >
      {isSwiping && swipeDirection === "left" && (
        <div
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none z-10"
          style={{ opacity: indicatorOpacity }}
        >
          <span
            className={cn(
              "text-xs font-medium transition-all duration-200",
              willTrigger
                ? "text-red-600 dark:text-red-400"
                : "text-red-400 dark:text-red-500",
            )}
          >
            {willTrigger ? "Release to dismiss" : "Dismiss"}
          </span>
          <div
            className={cn(
              "p-1.5 rounded-full transition-all duration-200",
              willTrigger
                ? "bg-red-500 text-white scale-110"
                : "bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400",
            )}
          >
            <XCircle className="h-4 w-4" />
          </div>
        </div>
      )}
      {isSwiping && swipeDirection === "right" && (
        <div
          className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none z-10"
          style={{ opacity: indicatorOpacity }}
        >
          <div
            className={cn(
              "p-1.5 rounded-full transition-all duration-200",
              willTrigger
                ? "bg-green-500 text-white scale-110"
                : "bg-green-100 dark:bg-green-900/30 text-green-500 dark:text-green-400",
            )}
          >
            <CheckCircle className="h-4 w-4" />
          </div>
          <span
            className={cn(
              "text-xs font-medium transition-all duration-200",
              willTrigger
                ? "text-green-600 dark:text-green-400"
                : "text-green-400 dark:text-green-500",
            )}
          >
            {willTrigger ? "Release to approve" : "Approve"}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}, areSwipeableCardPropsEqual);
