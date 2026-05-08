/**
 * Skeleton — loading placeholder block.
 *
 * Tailwind `animate-pulse` shimmer with rounded corners. Used by dashboard
 * v2 tiles before the lens-overview fetch resolves.
 */

import { cn } from "../../lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "animate-pulse rounded-md bg-gray-200/80 dark:bg-gray-700/60",
        className,
      )}
      {...rest}
    />
  );
}

/** Convenience: a row of horizontal text-line skeletons. */
export function SkeletonLines({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

export default Skeleton;
