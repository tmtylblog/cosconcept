"use client";

import { useState, useCallback, useRef } from "react";
import type { GraphNode, GraphEdge, GraphData, SearchResult } from "@/lib/graph/types";

interface UseGraphDataReturn {
  nodes: GraphNode[];
  edges: GraphEdge[];
  center: GraphNode | null;
  loading: boolean;
  error: string | null;
  /** Load initial graph (random COS customer firm) */
  loadInitial: () => Promise<void>;
  /** Expand a node — fetch its neighbors and merge into current graph */
  expandNode: (nodeId: string) => Promise<void>;
  /** Search graph nodes by name */
  searchNodes: (query: string) => Promise<SearchResult[]>;
  /** Center graph on a specific node (from search) */
  focusNode: (nodeId: string) => Promise<void>;
  /** Set of currently expanded node IDs */
  expandedNodes: Set<string>;
  /** Node type filter */
  visibleTypes: Set<string>;
  setVisibleTypes: (types: Set<string>) => void;
  /** Stats */
  stats: { nodeCount: number; edgeCount: number };
}

export function useGraphData(): UseGraphDataReturn {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [center, setCenter] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    new Set([
      "ServiceFirm",
      "Skill",
      "Category",
      "FirmCategory",
      "Industry",
      "Market",
      "CaseStudy",
      "Person",
      "Client",
    ])
  );

  const expandedNodesRef = useRef<Set<string>>(new Set());

  const mergeGraphData = useCallback(
    (newNodes: GraphNode[], newEdges: GraphEdge[]) => {
      setNodes((prev) => {
        const existing = new Map(prev.map((n) => [n.id, n]));
        for (const n of newNodes) {
          if (!existing.has(n.id)) {
            existing.set(n.id, n);
          }
        }
        return Array.from(existing.values());
      });

      setEdges((prev) => {
        const existingKeys = new Set(
          prev.map((e) => `${e.source}-${e.type}-${e.target}`)
        );
        const merged = [...prev];
        for (const e of newEdges) {
          const key = `${e.source}-${e.type}-${e.target}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            merged.push(e);
          }
        }
        return merged;
      });
    },
    []
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/graph/neighbors?limit=50");
      if (!res.ok) throw new Error("Failed to load graph");
      const data: GraphData = await res.json();
      setNodes(data.nodes);
      setEdges(data.edges);
      setCenter(data.center ?? null);
      if (data.center) {
        expandedNodesRef.current.add(data.center.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const expandNode = useCallback(
    async (nodeId: string) => {
      if (expandedNodesRef.current.has(nodeId)) return;
      expandedNodesRef.current.add(nodeId);

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/graph/neighbors?nodeId=${encodeURIComponent(nodeId)}&limit=50`
        );
        if (!res.ok) throw new Error("Failed to expand node");
        const data: GraphData = await res.json();
        mergeGraphData(data.nodes, data.edges);
      } catch (err) {
        expandedNodesRef.current.delete(nodeId);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [mergeGraphData]
  );

  const searchNodes = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (query.length < 2) return [];
    try {
      const res = await fetch(
        `/api/graph/search?q=${encodeURIComponent(query)}&limit=20`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.results ?? [];
    } catch {
      return [];
    }
  }, []);

  const focusNode = useCallback(
    async (nodeId: string) => {
      // If node is already in the graph, just re-center
      const existing = nodes.find((n) => n.id === nodeId);
      if (existing) {
        setCenter(existing);
        // Also expand it if not already expanded
        if (!expandedNodesRef.current.has(nodeId)) {
          await expandNode(nodeId);
        }
        return;
      }

      // Otherwise, fetch it fresh
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/graph/neighbors?nodeId=${encodeURIComponent(nodeId)}&limit=50`
        );
        if (!res.ok) throw new Error("Failed to focus node");
        const data: GraphData = await res.json();
        mergeGraphData(data.nodes, data.edges);
        if (data.center) {
          setCenter(data.center);
          expandedNodesRef.current.add(data.center.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [nodes, expandNode, mergeGraphData]
  );

  return {
    nodes,
    edges,
    center,
    loading,
    error,
    loadInitial,
    expandNode,
    searchNodes,
    focusNode,
    expandedNodes: expandedNodesRef.current,
    visibleTypes,
    setVisibleTypes,
    stats: { nodeCount: nodes.length, edgeCount: edges.length },
  };
}
