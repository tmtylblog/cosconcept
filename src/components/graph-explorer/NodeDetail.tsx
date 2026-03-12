"use client";

import { ExternalLink, X, ChevronRight } from "lucide-react";
import { NODE_COLORS, NODE_LABELS } from "@/lib/graph/colors";
import type { GraphNode, GraphEdge } from "@/lib/graph/types";

interface NodeDetailProps {
  node: GraphNode | null;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

/** Group edges by relationship type for display */
function groupEdges(
  node: GraphNode,
  edges: GraphEdge[],
  allNodes: GraphNode[]
) {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const groups = new Map<
    string,
    { type: string; direction: "out" | "in"; neighbors: GraphNode[] }
  >();

  for (const edge of edges) {
    const isSource = edge.source === node.id || (typeof edge.source === "object" && (edge.source as unknown as GraphNode).id === node.id);
    const neighborId = isSource
      ? typeof edge.target === "string" ? edge.target : (edge.target as unknown as GraphNode).id
      : typeof edge.source === "string" ? edge.source : (edge.source as unknown as GraphNode).id;
    const neighbor = nodeMap.get(neighborId);
    if (!neighbor) continue;

    const direction = isSource ? "out" : "in";
    const key = `${edge.type}-${direction}`;

    if (!groups.has(key)) {
      groups.set(key, { type: edge.type, direction, neighbors: [] });
    }
    groups.get(key)!.neighbors.push(neighbor);
  }

  return Array.from(groups.values()).sort((a, b) => {
    // Sort by count descending
    return b.neighbors.length - a.neighbors.length;
  });
}

/** Render a property value nicely */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string" && value.length > 100) return value.slice(0, 100) + "...";
  return String(value);
}

/** Properties to hide from the detail panel */
const HIDDEN_PROPS = new Set([
  "name",
  "legacyId",
  "legacyOrgId",
  "embedding",
  "enrichmentData",
]);

export default function NodeDetail({
  node,
  edges,
  allNodes,
  onClose,
  onNavigate,
}: NodeDetailProps) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-cos-slate">
        <div>
          <div className="mb-2 text-2xl">🔍</div>
          <p>Click a node to view details</p>
          <p className="mt-1 text-xs text-cos-slate-light">
            Double-click to expand neighbors
          </p>
        </div>
      </div>
    );
  }

  const color = NODE_COLORS[node.type] ?? "#9b9590";
  const label = NODE_LABELS[node.type] ?? node.type;

  // Relevant edges for this node
  const relevantEdges = edges.filter((e) => {
    const srcId = typeof e.source === "string" ? e.source : (e.source as unknown as GraphNode).id;
    const tgtId = typeof e.target === "string" ? e.target : (e.target as unknown as GraphNode).id;
    return srcId === node.id || tgtId === node.id;
  });

  const grouped = groupEdges(node, relevantEdges, allNodes);

  // Properties to display (filter out internal/hidden ones)
  const displayProps = Object.entries(node.properties).filter(
    ([key]) => !HIDDEN_PROPS.has(key) && !key.startsWith("_")
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-cos-border p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span
              className="rounded-cos-pill px-2 py-0.5 text-[10px] font-bold uppercase text-white"
              style={{ backgroundColor: color }}
            >
              {label}
            </span>
          </div>
          <h3 className="mt-1.5 truncate text-sm font-bold text-cos-midnight">
            {node.name}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="ml-2 shrink-0 rounded-cos p-1 text-cos-slate hover:bg-cos-cloud hover:text-cos-midnight"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Properties */}
        {displayProps.length > 0 && (
          <div className="border-b border-cos-border p-3">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cos-slate">
              Properties
            </h4>
            <div className="space-y-1.5">
              {displayProps.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <span className="w-24 shrink-0 truncate font-medium text-cos-slate">
                    {key}
                  </span>
                  <span className="min-w-0 break-words text-cos-midnight">
                    {typeof value === "string" && value.startsWith("http") ? (
                      <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-cos-electric hover:underline"
                      >
                        {renderValue(value)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      renderValue(value)
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connections grouped by type */}
        <div className="p-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cos-slate">
            Connections ({relevantEdges.length})
          </h4>
          {grouped.length === 0 ? (
            <p className="text-xs text-cos-slate-light">No connections loaded</p>
          ) : (
            <div className="space-y-3">
              {grouped.map(({ type, direction, neighbors }) => (
                <div key={`${type}-${direction}`}>
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-cos-slate">
                    <span className={direction === "out" ? "text-cos-electric" : "text-cos-ember"}>
                      {direction === "out" ? "→" : "←"}
                    </span>
                    <span className="uppercase">{type.replace(/_/g, " ")}</span>
                    <span className="text-cos-slate-light">({neighbors.length})</span>
                  </div>
                  <div className="space-y-0.5">
                    {neighbors.slice(0, 10).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => onNavigate(n.id)}
                        className="group flex w-full items-center gap-2 rounded-cos px-2 py-1 text-left text-xs transition-colors hover:bg-cos-cloud/80"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: NODE_COLORS[n.type] ?? "#9b9590",
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-cos-midnight">
                          {n.name}
                        </span>
                        <ChevronRight className="h-3 w-3 shrink-0 text-cos-slate-light opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ))}
                    {neighbors.length > 10 && (
                      <p className="px-2 text-[10px] text-cos-slate-light">
                        + {neighbors.length - 10} more
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
