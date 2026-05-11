/**
 * Pure layout/data-shaping for the ConceptNetworkDiagram: radial node
 * positioning around the source card, and the transform from
 * `RelatedCard[]` into React Flow nodes and edges.
 *
 * @module components/visualizations/ConceptNetworkDiagram/layout
 */

import type { Edge, Node } from "@xyflow/react";

import type { RelatedCard } from "../../../lib/discovery-api";

import {
  formatRelationshipType,
  getEdgeStrokeWidth,
  getHorizonColors,
} from "./helpers";
import type { CardNodeData, Horizon } from "./types";

export function calculateRadialLayout(
  centerX: number,
  centerY: number,
  radius: number,
  nodeCount: number,
): { x: number; y: number }[] {
  if (nodeCount === 0) return [];
  if (nodeCount === 1) return [{ x: centerX + radius, y: centerY }];

  const positions: { x: number; y: number }[] = [];
  const angleStep = (2 * Math.PI) / nodeCount;
  // Start from top, go clockwise.
  const startAngle = -Math.PI / 2;

  for (let i = 0; i < nodeCount; i++) {
    const angle = startAngle + i * angleStep;
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }

  return positions;
}

export interface TransformOptions {
  sourceCardId: string;
  sourceCardName: string;
  sourceCardSummary?: string | null;
  sourceCardHorizon?: Horizon | null;
  relatedCards: RelatedCard[];
  onCardClick?: (cardId: string, cardSlug: string) => void;
}

export function transformToGraphData({
  sourceCardId,
  sourceCardName,
  sourceCardSummary,
  sourceCardHorizon,
  relatedCards,
  onCardClick,
}: TransformOptions): { nodes: Node<CardNodeData>[]; edges: Edge[] } {
  const centerX = 400;
  const centerY = 300;
  const radius = 250;

  const positions = calculateRadialLayout(
    centerX,
    centerY,
    radius,
    relatedCards.length,
  );

  const sourceNode: Node<CardNodeData> = {
    id: sourceCardId,
    type: "cardNode",
    position: { x: centerX - 100, y: centerY - 50 },
    data: {
      id: sourceCardId,
      name: sourceCardName,
      slug: "",
      summary: sourceCardSummary,
      horizon: sourceCardHorizon,
      isSource: true,
      onCardClick: undefined,
    },
    draggable: true,
  };

  const relatedNodes: Node<CardNodeData>[] = relatedCards.map((card, index) => {
    const pos = positions[index];
    return {
      id: card.id,
      type: "cardNode",
      position: pos ? { x: pos.x - 100, y: pos.y - 50 } : { x: 0, y: 0 },
      data: {
        id: card.id,
        name: card.name,
        slug: card.slug,
        summary: card.summary,
        horizon: card.horizon,
        relationshipType: card.relationship_type,
        relationshipStrength: card.relationship_strength,
        isSource: false,
        onCardClick,
      },
      draggable: true,
    };
  });

  const edges: Edge[] = relatedCards.map((card) => {
    const colors = getHorizonColors(card.horizon);
    return {
      id: `e-${sourceCardId}-${card.id}`,
      source: sourceCardId,
      target: card.id,
      type: "default",
      animated: false,
      label: formatRelationshipType(card.relationship_type),
      labelStyle: { fontSize: 10, fill: "#6b7280" },
      labelBgStyle: { fill: "white", fillOpacity: 0.8 },
      style: {
        stroke: colors.fill,
        strokeWidth: getEdgeStrokeWidth(card.relationship_strength),
      },
    };
  });

  return {
    nodes: [sourceNode, ...relatedNodes],
    edges,
  };
}
