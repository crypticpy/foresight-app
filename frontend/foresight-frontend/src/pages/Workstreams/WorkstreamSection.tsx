/**
 * Section wrapper used three times on the Workstreams page (Strategic, My,
 * Shared with me). Renders the heading + subhead, then a 3-column grid of
 * `WorkstreamCard`s. Pass an `emptyState` to handle the "no workstreams yet"
 * case for the My section without inlining that hint into the composer.
 *
 * @module pages/Workstreams/WorkstreamSection
 */

import type { ReactNode } from "react";
import type { Workstream } from "../../components/WorkstreamForm";
import type { Driver } from "../../lib/frameworks-api";
import type { WorkstreamScanStatusResponse } from "../../lib/workstream-api";
import { WorkstreamCard } from "./WorkstreamCard";

interface WorkstreamSectionProps {
  title: string;
  subtitle: string;
  workstreams: Workstream[];
  scanStatuses: Record<string, WorkstreamScanStatusResponse>;
  driversById: Record<string, Driver>;
  onEdit: (ws: Workstream) => void;
  onDelete: (ws: Workstream) => void;
  onShare: (ws: Workstream) => void;
  onMembers: (ws: Workstream) => void;
  emptyState?: ReactNode;
}

export function WorkstreamSection({
  title,
  subtitle,
  workstreams,
  scanStatuses,
  driversById,
  onEdit,
  onDelete,
  onShare,
  onMembers,
  emptyState,
}: WorkstreamSectionProps) {
  return (
    <section>
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </header>
      {workstreams.length === 0 && emptyState ? (
        emptyState
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workstreams.map((workstream) => (
            <WorkstreamCard
              key={workstream.id}
              workstream={workstream}
              onEdit={() => onEdit(workstream)}
              onDelete={() => onDelete(workstream)}
              onShare={() => onShare(workstream)}
              onMembers={() => onMembers(workstream)}
              scanStatus={scanStatuses[workstream.id] || null}
              driversById={driversById}
            />
          ))}
        </div>
      )}
    </section>
  );
}
