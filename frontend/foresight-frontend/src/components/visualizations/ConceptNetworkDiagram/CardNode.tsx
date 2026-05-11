/**
 * Custom React Flow node for a single card in the ConceptNetworkDiagram.
 * Handles the four connection points, click/keyboard activation, and the
 * horizon-tinted card-body styling.
 *
 * @module components/visualizations/ConceptNetworkDiagram/CardNode
 */

import { memo, useCallback } from "react";
import { ExternalLink } from "lucide-react";
import { Handle, Node, NodeProps, Position } from "@xyflow/react";

import { cn } from "../../../lib/utils";

import { formatRelationshipType, getHorizonColors } from "./helpers";
import type { CardNodeData } from "./types";

export const CardNode = memo(({ data }: NodeProps<Node<CardNodeData>>) => {
  const colors = getHorizonColors(data.horizon);
  const isSource = data.isSource;

  const handleClick = useCallback(() => {
    if (data.onCardClick && data.id && data.slug) {
      data.onCardClick(data.id, data.slug);
    }
  }, [data]);

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-500 !border-none"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-500 !border-none"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-500 !border-none"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-500 !border-none"
      />

      <div
        onClick={handleClick}
        className={cn(
          "px-4 py-3 rounded-lg border-2 shadow-md cursor-pointer transition-all duration-200",
          "hover:shadow-lg hover:scale-[1.02]",
          "min-w-[180px] max-w-[240px]",
          colors.bg,
          colors.border,
          isSource && "ring-2 ring-offset-2 ring-blue-500 dark:ring-blue-400",
        )}
        role="button"
        tabIndex={0}
        aria-label={`View ${data.name} signal details`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleClick();
          }
        }}
      >
        {isSource && (
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">C</span>
          </div>
        )}

        <div
          className={cn("font-semibold text-sm truncate", colors.text)}
          title={data.name}
        >
          {data.name}
        </div>

        {data.summary && (
          <div
            className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2"
            title={data.summary}
          >
            {data.summary}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          {data.horizon && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium",
                colors.bg,
                colors.text,
              )}
            >
              {data.horizon}
            </span>
          )}
          {!isSource && data.relationshipType && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[80px]">
              {formatRelationshipType(data.relationshipType)}
            </span>
          )}
          <ExternalLink className="h-3 w-3 text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0" />
        </div>
      </div>
    </>
  );
});

CardNode.displayName = "CardNode";

export const nodeTypes = {
  cardNode: CardNode,
};
