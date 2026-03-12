"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import GraphViewer from "@/components/graph-explorer/GraphViewer";
import GraphFilters from "@/components/graph-explorer/GraphFilters";
import GraphSearch from "@/components/graph-explorer/GraphSearch";
import NodeDetail from "@/components/graph-explorer/NodeDetail";
import { useGraphData } from "@/components/graph-explorer/useGraphData";
import type { GraphNode, NodeType } from "@/lib/graph/types";

export default function KnowledgeGraphPage() {
  const {
    nodes,
    edges,
    center,
    loading,
    error,
    loadInitial,
    expandNode,
    searchNodes,
    focusNode,
    expandedNodes,
    visibleTypes,
    setVisibleTypes,
    stats,
  } = useGraphData();

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  // Load initial graph on mount
  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Handle node click (select)
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  // Handle node double-click (expand)
  const handleNodeDoubleClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node);
      expandNode(node.id);
    },
    [expandNode]
  );

  // Toggle node type visibility
  const handleToggleType = useCallback(
    (type: NodeType) => {
      const next = new Set(visibleTypes);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      setVisibleTypes(next);
    },
    [visibleTypes, setVisibleTypes]
  );

  // Navigate to a node from detail panel
  const handleNavigate = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
        expandNode(nodeId);
      }
    },
    [nodes, expandNode]
  );

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!outerRef.current) return;
    if (!isFullscreen) {
      outerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  // Listen for fullscreen exit via Escape
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div
      ref={outerRef}
      className={`flex flex-col ${
        isFullscreen ? "h-screen bg-white" : "h-[calc(100vh-8rem)]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cos-border px-4 py-3">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-tight text-cos-midnight">
            Knowledge Graph Explorer
          </h1>
          <p className="mt-0.5 text-xs text-cos-slate">
            Interactive visualization of entities and relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-64">
            <GraphSearch onSearch={searchNodes} onSelect={focusNode} />
          </div>
          <button
            onClick={() => {
              setSelectedNode(null);
              loadInitial();
            }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-cos border border-cos-border px-3 py-2 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud hover:text-cos-midnight disabled:opacity-50"
            title="Load random firm"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Shuffle
          </button>
          <button
            onClick={toggleFullscreen}
            className="rounded-cos border border-cos-border p-2 text-cos-slate transition-colors hover:bg-cos-cloud hover:text-cos-midnight"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-cos-ember/20 bg-cos-ember/5 px-4 py-2 text-xs text-cos-ember">
          {error}
        </div>
      )}

      {/* Main content: 3-column layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Filters */}
        <div className="hidden w-52 shrink-0 overflow-y-auto border-r border-cos-border p-3 lg:block">
          <GraphFilters
            visibleTypes={visibleTypes}
            onToggleType={handleToggleType}
            stats={stats}
          />
        </div>

        {/* Center: Graph canvas */}
        <div ref={graphContainerRef} className="relative min-w-0 flex-1 bg-cos-cloud/30">
          {loading && nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
              <p className="text-sm text-cos-slate">Loading graph data...</p>
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="text-4xl">🕸️</div>
              <p className="text-sm text-cos-slate">No graph data available</p>
              <button
                onClick={loadInitial}
                className="rounded-cos bg-cos-electric px-4 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover"
              >
                Load Graph
              </button>
            </div>
          ) : (
            <>
              <GraphViewer
                nodes={nodes}
                edges={edges}
                center={center}
                visibleTypes={visibleTypes}
                selectedNode={selectedNode}
                expandedNodes={expandedNodes}
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleNodeDoubleClick}
                containerRef={graphContainerRef}
              />

              {/* Loading overlay */}
              {loading && (
                <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-cos-lg bg-white/90 px-3 py-2 shadow-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cos-electric" />
                  <span className="text-xs text-cos-slate">Expanding...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Node detail */}
        <div className="w-72 shrink-0 overflow-hidden border-l border-cos-border">
          <NodeDetail
            node={selectedNode}
            edges={edges}
            allNodes={nodes}
            onClose={() => setSelectedNode(null)}
            onNavigate={handleNavigate}
          />
        </div>
      </div>
    </div>
  );
}
