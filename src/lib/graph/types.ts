/**
 * Graph Explorer type definitions.
 *
 * These types drive the force-directed graph visualization
 * on the /admin/knowledge-graph page.
 */

export type NodeType =
  | "ServiceFirm"
  | "Skill"
  | "Category"
  | "FirmCategory"
  | "Industry"
  | "Market"
  | "CaseStudy"
  | "Person"
  | "Client"
  | "Organization"
  | "Company";

/** A node in the graph visualization */
export interface GraphNode {
  /** Neo4j element ID (string) */
  id: string;
  /** Display label */
  name: string;
  /** Primary Neo4j label */
  type: NodeType;
  /** All Neo4j labels on this node */
  labels: string[];
  /** Arbitrary properties from Neo4j */
  properties: Record<string, unknown>;
  /** Number of total relationships (shown on hover) */
  edgeCount?: number;

  // Force-graph internal fields (set by the library)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

/** An edge in the graph visualization */
export interface GraphEdge {
  /** Source node id */
  source: string;
  /** Target node id */
  target: string;
  /** Relationship type, e.g. HAS_SKILL, SERVES_INDUSTRY */
  type: string;
  /** Arbitrary edge properties */
  properties?: Record<string, unknown>;
}

/** Full graph payload returned by /api/graph/* endpoints */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The center/starting node (if any) */
  center?: GraphNode | null;
}

/** Query params for /api/graph/neighbors */
export interface NeighborsParams {
  nodeId: string;
  nodeType: string;
  hops?: number;
  nodeTypes?: string[];
  limit?: number;
}

/** Query params for /api/graph/search */
export interface SearchParams {
  q: string;
  type?: NodeType;
  limit?: number;
}

/** Search result item */
export interface SearchResult {
  id: string;
  name: string;
  type: NodeType;
  labels: string[];
}
