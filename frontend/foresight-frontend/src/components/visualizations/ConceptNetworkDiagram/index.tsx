/**
 * ConceptNetworkDiagram — interactive React Flow graph showing how a
 * source card relates to a set of related cards. The composer here is
 * thin: layout/data shaping lives in `./layout`, the custom node lives
 * in `./CardNode`, presentational helpers + placeholders live alongside.
 *
 * Features: pan/zoom, horizon-coloured nodes, edge labels and thickness
 * based on relationship strength, click-to-navigate for related cards.
 *
 * @module components/visualizations/ConceptNetworkDiagram
 */

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitBranch } from "lucide-react";

import { cn } from "../../../lib/utils";
import type { RelatedCard } from "../../../lib/discovery-api";

import { nodeTypes } from "./CardNode";
import { minimapNodeColor } from "./helpers";
import { transformToGraphData } from "./layout";
import { EmptyState, LoadingState, NetworkErrorState } from "./States";
import type { Horizon } from "./types";

export interface ConceptNetworkDiagramProps {
  /** ID of the source/central card */
  sourceCardId: string;
  /** Name of the source card (displayed in center) */
  sourceCardName: string;
  /** Optional summary of the source card */
  sourceCardSummary?: string | null;
  /** Horizon of the source card */
  sourceCardHorizon?: Horizon | null;
  /** Related cards data */
  relatedCards: RelatedCard[];
  /** Height of the diagram container */
  height?: number;
  /** Additional className for container */
  className?: string;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string | null;
  /** Retry callback for error state */
  onRetry?: () => void;
  /** Callback when a card node is clicked */
  onCardClick?: (cardId: string, cardSlug: string) => void;
  /** Whether to show the minimap */
  showMinimap?: boolean;
  /** Whether to show background */
  showBackground?: boolean;
  /** Title for the section */
  title?: string;
}

function DiagramShell({
  title,
  className,
  height,
  children,
}: {
  title?: string;
  className?: string;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-dark-surface rounded-lg shadow p-6",
        className,
      )}
    >
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-brand-blue" />
          {title}
        </h3>
      )}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

export function ConceptNetworkDiagram({
  sourceCardId,
  sourceCardName,
  sourceCardSummary,
  sourceCardHorizon,
  relatedCards,
  height = 500,
  className,
  loading = false,
  error = null,
  onRetry,
  onCardClick,
  showMinimap = true,
  showBackground = true,
  title = "Related Trends Network",
}: ConceptNetworkDiagramProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const { nodes, edges } = transformToGraphData({
      sourceCardId,
      sourceCardName,
      sourceCardSummary,
      sourceCardHorizon,
      relatedCards,
      onCardClick,
    });
    return { initialNodes: nodes, initialEdges: edges };
  }, [
    sourceCardId,
    sourceCardName,
    sourceCardSummary,
    sourceCardHorizon,
    relatedCards,
    onCardClick,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Re-sync the React Flow state when the source props change.
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (loading) {
    return (
      <DiagramShell title={title} className={className} height={height}>
        <LoadingState />
      </DiagramShell>
    );
  }

  if (error) {
    return (
      <DiagramShell title={title} className={className} height={height}>
        <NetworkErrorState message={error} onRetry={onRetry} />
      </DiagramShell>
    );
  }

  if (relatedCards.length === 0) {
    return (
      <DiagramShell title={title} className={className} height={height}>
        <EmptyState />
      </DiagramShell>
    );
  }

  return (
    <div
      className={cn(
        "bg-white dark:bg-dark-surface rounded-lg shadow p-6",
        className,
      )}
    >
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-brand-blue" />
          {title}
        </h3>
      )}

      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span>Current Signal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>H1 (Mainstream)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-amber-500" />
          <span>H2 (Transitional)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-500" />
          <span>H3 (Transformative)</span>
        </div>
      </div>

      <div
        style={{ height }}
        className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          attributionPosition="bottom-right"
          proOptions={{ hideAttribution: true }}
        >
          {showBackground && (
            <Background
              variant={BackgroundVariant.Dots}
              gap={12}
              size={1}
              className="bg-gray-50 dark:bg-gray-900"
            />
          )}
          <Controls
            showZoom={true}
            showFitView={true}
            showInteractive={false}
            className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700 !shadow-md"
          />
          {showMinimap && (
            <MiniMap
              nodeColor={minimapNodeColor}
              maskColor="rgba(0, 0, 0, 0.1)"
              className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700 !shadow-md"
              pannable
              zoomable
            />
          )}
        </ReactFlow>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {relatedCards.length} related trend
          {relatedCards.length !== 1 ? "s" : ""}
        </span>
        <span>Click a signal to view details</span>
      </div>
    </div>
  );
}

export default ConceptNetworkDiagram;
