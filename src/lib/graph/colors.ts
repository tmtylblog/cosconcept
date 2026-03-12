/**
 * Node type → color mapping for graph visualization.
 *
 * Uses COS design tokens from globals.css.
 * Hex values hardcoded here for canvas rendering (react-force-graph uses raw hex).
 */

import type { NodeType } from "./types";

/** Color palette keyed by node type */
export const NODE_COLORS: Record<NodeType, string> = {
  ServiceFirm: "#1f86a1", // cos-electric — primary teal
  Skill: "#60b9bf", // cos-signal — secondary cyan
  Category: "#f3af3d", // cos-warm — gold
  FirmCategory: "#f3af3d", // cos-warm — gold (same as Category)
  Industry: "#e44627", // cos-ember — red-orange
  Market: "#d99a2f", // cos-warm-dim — darker gold
  CaseStudy: "#4a9da3", // cos-signal-dim — darker cyan
  Person: "#9b9590", // cos-slate — gray
  Client: "#b5aea9", // cos-slate-light — light gray
  Organization: "#9b9590", // cos-slate — gray (legacy)
  Company: "#b5aea9", // cos-slate-light — light gray
};

/** Radius per node type (px) */
export const NODE_SIZES: Record<NodeType, number> = {
  ServiceFirm: 10,
  Skill: 5,
  Category: 6,
  FirmCategory: 6,
  Industry: 6,
  Market: 6,
  CaseStudy: 5,
  Person: 4,
  Client: 4,
  Organization: 6,
  Company: 4,
};

/** Human-readable label per node type */
export const NODE_LABELS: Record<NodeType, string> = {
  ServiceFirm: "Firm",
  Skill: "Skill",
  Category: "Category",
  FirmCategory: "Category",
  Industry: "Industry",
  Market: "Market",
  CaseStudy: "Case Study",
  Person: "Person",
  Client: "Client",
  Organization: "Organization",
  Company: "Company",
};

/** Edge type → color mapping */
export const EDGE_COLORS: Record<string, string> = {
  HAS_SKILL: "#60b9bf40", // cos-signal translucent
  SERVES_INDUSTRY: "#e4462740", // cos-ember translucent
  OPERATES_IN: "#d99a2f40", // cos-warm-dim translucent
  IN_CATEGORY: "#f3af3d40", // cos-warm translucent
  PREFERS: "#1f86a140", // cos-electric translucent
  OWNED_BY: "#4a9da340", // cos-signal-dim translucent
  HAS_CASE_STUDY: "#4a9da340",
  BELONGS_TO: "#9b959040", // cos-slate translucent
  WORKED_WITH: "#b5aea940",
};

/** Fallback edge color */
export const DEFAULT_EDGE_COLOR = "#9b959030";

/** Get the color for a given edge type */
export function getEdgeColor(type: string): string {
  return EDGE_COLORS[type] ?? DEFAULT_EDGE_COLOR;
}

/** Primary filterable node types (shown in filter panel) */
export const FILTERABLE_NODE_TYPES: NodeType[] = [
  "ServiceFirm",
  "Skill",
  "Category",
  "Industry",
  "Market",
  "CaseStudy",
  "Person",
  "Client",
];
