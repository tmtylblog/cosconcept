"use client";

import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { NODE_COLORS, NODE_SIZES, NODE_LABELS, getEdgeColor } from "@/lib/graph/colors";
import type { GraphNode, GraphEdge } from "@/lib/graph/types";

// Dynamic import — react-force-graph-2d is canvas-based, CSR only
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-cos-electric border-t-transparent" />
    </div>
  ),
});

interface GraphViewerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  center: GraphNode | null;
  visibleTypes: Set<string>;
  selectedNode: GraphNode | null;
  expandedNodes: Set<string>;
  onNodeClick: (node: GraphNode) => void;
  onNodeDoubleClick: (node: GraphNode) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function GraphViewer({
  nodes,
  edges,
  center,
  visibleTypes,
  selectedNode,
  expandedNodes,
  onNodeClick,
  onNodeDoubleClick,
  containerRef,
}: GraphViewerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.max(width, 200), height: Math.max(height, 200) });
      }
    });

    ro.observe(container);
    // Initial measurement
    const rect = container.getBoundingClientRect();
    setDimensions({ width: Math.max(rect.width, 200), height: Math.max(rect.height, 200) });

    return () => ro.disconnect();
  }, [containerRef]);

  // Center on the center node when it changes
  useEffect(() => {
    if (center && graphRef.current) {
      setTimeout(() => {
        graphRef.current?.centerAt?.(center.x ?? 0, center.y ?? 0, 500);
        graphRef.current?.zoom?.(2, 500);
      }, 300);
    }
  }, [center]);

  // Filter nodes and edges by visible types
  const filteredData = useMemo(() => {
    const visibleNodes = nodes.filter((n) => visibleTypes.has(n.type));
    const visibleIds = new Set(visibleNodes.map((n) => n.id));

    const visibleEdges = edges.filter((e) => {
      const srcId = typeof e.source === "string" ? e.source : (e.source as unknown as GraphNode).id;
      const tgtId = typeof e.target === "string" ? e.target : (e.target as unknown as GraphNode).id;
      return visibleIds.has(srcId) && visibleIds.has(tgtId);
    });

    return {
      nodes: visibleNodes,
      links: visibleEdges.map((e) => ({
        source: typeof e.source === "string" ? e.source : (e.source as unknown as GraphNode).id,
        target: typeof e.target === "string" ? e.target : (e.target as unknown as GraphNode).id,
        type: e.type,
      })),
    };
  }, [nodes, edges, visibleTypes]);

  // Custom node rendering on canvas
  const drawNode = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const size = NODE_SIZES[n.type] ?? 5;
      const color = NODE_COLORS[n.type] ?? "#9b9590";
      const isSelected = selectedNode?.id === n.id;
      const isExpanded = expandedNodes.has(n.id);
      const x = n.x ?? 0;
      const y = n.y ?? 0;

      // Glow for selected node
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}30`;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Ring for expanded nodes
      if (isExpanded && !isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, size + 2, 0, 2 * Math.PI);
        ctx.strokeStyle = `${color}60`;
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Label (only show when zoomed in enough)
      if (globalScale > 1.2 || isSelected || n.type === "ServiceFirm") {
        const labelSize = Math.max(10 / globalScale, 3);
        ctx.font = `${isSelected ? "bold " : ""}${labelSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSelected ? "#3a302d" : "#9b9590";

        const displayName = n.name.length > 25 ? n.name.slice(0, 22) + "..." : n.name;
        ctx.fillText(displayName, x, y + size + 2);
      }
    },
    [selectedNode, expandedNodes]
  );

  // Link rendering
  const linkColor = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (link: any) => {
      return getEdgeColor(link.type);
    },
    []
  );

  // Node hover area
  const nodePointerArea = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode;
      const size = NODE_SIZES[n.type] ?? 5;
      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, size + 4, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  // Handle double click for expansion
  const handleNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, event: MouseEvent) => {
      // Detect double click by checking detail
      if (event.detail === 2) {
        onNodeDoubleClick(node as GraphNode);
      } else {
        onNodeClick(node as GraphNode);
      }
    },
    [onNodeClick, onNodeDoubleClick]
  );

  return (
    <ForceGraph2D
      ref={graphRef}
      width={dimensions.width}
      height={dimensions.height}
      graphData={filteredData}
      nodeId="id"
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={nodePointerArea}
      linkColor={linkColor}
      linkWidth={1}
      linkDirectionalArrowLength={3}
      linkDirectionalArrowRelPos={1}
      onNodeClick={handleNodeClick}
      cooldownTicks={100}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
      enableNodeDrag={true}
      enableZoomInteraction={true}
      enablePanInteraction={true}
      backgroundColor="transparent"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeLabel={(n: any) => {
        const node = n as GraphNode;
        return `${NODE_LABELS[node.type] ?? node.type}: ${node.name}`;
      }}
    />
  );
}
