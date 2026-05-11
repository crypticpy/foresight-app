/**
 * Shared types for the ConceptNetworkDiagram sub-modules. Only the data
 * shape carried inside React Flow nodes lives here; the component's public
 * prop type is exported from `./index` alongside the component itself.
 *
 * @module components/visualizations/ConceptNetworkDiagram/types
 */

export type Horizon = "H1" | "H2" | "H3";

// Index signature satisfies React Flow's `Node<T extends Record<string, unknown>>`
// constraint without forcing each call-site to widen via `as`.
export interface CardNodeData {
  id: string;
  name: string;
  slug: string;
  summary?: string | null;
  horizon?: Horizon | null;
  relationshipType?: string | null;
  relationshipStrength?: number | null;
  isSource: boolean;
  onCardClick?: (cardId: string, cardSlug: string) => void;
  [key: string]: unknown;
}

export interface HorizonColors {
  bg: string;
  border: string;
  text: string;
  fill: string;
}
