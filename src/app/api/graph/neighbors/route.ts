/**
 * GET /api/graph/neighbors
 *
 * Fetch a node and its N-hop neighbors from Neo4j.
 *
 * Query params:
 *   nodeId    — Neo4j element ID of the starting node
 *   nodeType  — label of the starting node (ServiceFirm, Skill, etc.)
 *   hops      — depth (default 1, max 3)
 *   nodeTypes — comma-separated filter of allowed neighbor labels
 *   limit     — max neighbors returned (default 50, max 200)
 *
 * If no nodeId is provided, returns a random COS customer firm
 * with its 1-hop neighbors (initial load).
 */

import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { neo4jRead } from "@/lib/neo4j";
import type { GraphNode, GraphEdge, GraphData, NodeType } from "@/lib/graph/types";

// All labels we care about for the graph explorer
const ALL_LABELS = [
  "ServiceFirm",
  "Skill",
  "Category",
  "FirmCategory",
  "Industry",
  "Market",
  "CaseStudy",
  "Person",
  "Client",
  "Organization",
  "Company",
];

interface NeoRecord {
  startId: string;
  startName: string;
  startLabels: string[];
  startProps: Record<string, unknown>;
  neighborId: string;
  neighborName: string;
  neighborLabels: string[];
  neighborProps: Record<string, unknown>;
  relType: string;
  relProps: Record<string, unknown>;
  direction: string;
}

interface InitialRecord {
  firmId: string;
  firmName: string;
  firmLabels: string[];
  firmProps: Record<string, unknown>;
  neighborId: string;
  neighborName: string;
  neighborLabels: string[];
  neighborProps: Record<string, unknown>;
  relType: string;
  relProps: Record<string, unknown>;
  direction: string;
}

function primaryLabel(labels: string[]): NodeType {
  // Return the most specific label (prefer our known types over generic ones)
  for (const l of ALL_LABELS) {
    if (labels.includes(l)) return l as NodeType;
  }
  return (labels[0] ?? "Unknown") as NodeType;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const nodeId = url.searchParams.get("nodeId");
    const hops = Math.min(Number(url.searchParams.get("hops") ?? 1), 3);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const nodeTypesParam = url.searchParams.get("nodeTypes");
    const allowedTypes = nodeTypesParam
      ? nodeTypesParam.split(",").filter(Boolean)
      : ALL_LABELS;

    // --- Initial load: random COS customer firm ---
    if (!nodeId) {
      const cypher = `
        MATCH (f:ServiceFirm {isCosCustomer: true})
        WITH f, rand() as r ORDER BY r LIMIT 1
        OPTIONAL MATCH (f)-[rel]-(n)
        WHERE any(lbl IN labels(n) WHERE lbl IN $allowedTypes)
        WITH f, rel, n
        LIMIT $limit
        RETURN
          elementId(f) as firmId,
          f.name as firmName,
          labels(f) as firmLabels,
          properties(f) as firmProps,
          CASE WHEN n IS NOT NULL THEN elementId(n) ELSE null END as neighborId,
          CASE WHEN n IS NOT NULL THEN n.name ELSE null END as neighborName,
          CASE WHEN n IS NOT NULL THEN labels(n) ELSE [] END as neighborLabels,
          CASE WHEN n IS NOT NULL THEN properties(n) ELSE {} END as neighborProps,
          CASE WHEN rel IS NOT NULL THEN type(rel) ELSE null END as relType,
          CASE WHEN rel IS NOT NULL THEN properties(rel) ELSE {} END as relProps,
          CASE WHEN rel IS NOT NULL THEN
            CASE WHEN startNode(rel) = f THEN 'outgoing' ELSE 'incoming' END
          ELSE null END as direction
      `;

      const rows = await neo4jRead<InitialRecord>(cypher, { allowedTypes, limit: neo4j.int(limit) });

      if (rows.length === 0) {
        return NextResponse.json({ nodes: [], edges: [], center: null } satisfies GraphData);
      }

      const nodesMap = new Map<string, GraphNode>();
      const edgesArr: GraphEdge[] = [];

      // Center firm
      const first = rows[0];
      const centerNode: GraphNode = {
        id: first.firmId,
        name: first.firmName ?? "Unknown",
        type: primaryLabel(first.firmLabels),
        labels: first.firmLabels,
        properties: first.firmProps,
      };
      nodesMap.set(centerNode.id, centerNode);

      for (const row of rows) {
        if (!row.neighborId) continue;
        if (!nodesMap.has(row.neighborId)) {
          nodesMap.set(row.neighborId, {
            id: row.neighborId,
            name: row.neighborName ?? "Unknown",
            type: primaryLabel(row.neighborLabels),
            labels: row.neighborLabels,
            properties: row.neighborProps,
          });
        }
        // Edges: always source→target with actual direction
        const source = row.direction === "outgoing" ? first.firmId : row.neighborId;
        const target = row.direction === "outgoing" ? row.neighborId : first.firmId;
        edgesArr.push({
          source,
          target,
          type: row.relType,
          properties: row.relProps,
        });
      }

      return NextResponse.json({
        nodes: Array.from(nodesMap.values()),
        edges: edgesArr,
        center: centerNode,
      } satisfies GraphData);
    }

    // --- Expand a specific node ---
    // Note: hops param reserved for future multi-hop expansion
    void hops;
    const cypher = `
      MATCH (start)
      WHERE elementId(start) = $nodeId
      OPTIONAL MATCH (start)-[rel]-(neighbor)
      WHERE any(lbl IN labels(neighbor) WHERE lbl IN $allowedTypes)
      WITH start, rel, neighbor
      LIMIT $limit
      RETURN
        elementId(start) as startId,
        start.name as startName,
        labels(start) as startLabels,
        properties(start) as startProps,
        CASE WHEN neighbor IS NOT NULL THEN elementId(neighbor) ELSE null END as neighborId,
        CASE WHEN neighbor IS NOT NULL THEN neighbor.name ELSE null END as neighborName,
        CASE WHEN neighbor IS NOT NULL THEN labels(neighbor) ELSE [] END as neighborLabels,
        CASE WHEN neighbor IS NOT NULL THEN properties(neighbor) ELSE {} END as neighborProps,
        CASE WHEN rel IS NOT NULL THEN type(rel) ELSE null END as relType,
        CASE WHEN rel IS NOT NULL THEN properties(rel) ELSE {} END as relProps,
        CASE WHEN rel IS NOT NULL THEN
          CASE WHEN startNode(rel) = start THEN 'outgoing' ELSE 'incoming' END
        ELSE null END as direction
    `;

    const rows = await neo4jRead<NeoRecord>(cypher, {
      nodeId,
      allowedTypes,
      limit: neo4j.int(limit),
    });

    if (rows.length === 0) {
      return NextResponse.json({ nodes: [], edges: [], center: null } satisfies GraphData);
    }

    const nodesMap = new Map<string, GraphNode>();
    const edgesArr: GraphEdge[] = [];

    const first = rows[0];
    const centerNode: GraphNode = {
      id: first.startId,
      name: first.startName ?? "Unknown",
      type: primaryLabel(first.startLabels),
      labels: first.startLabels,
      properties: first.startProps,
    };
    nodesMap.set(centerNode.id, centerNode);

    for (const row of rows) {
      if (!row.neighborId) continue;
      if (!nodesMap.has(row.neighborId)) {
        nodesMap.set(row.neighborId, {
          id: row.neighborId,
          name: row.neighborName ?? "Unknown",
          type: primaryLabel(row.neighborLabels),
          labels: row.neighborLabels,
          properties: row.neighborProps,
        });
      }
      const source = row.direction === "outgoing" ? first.startId : row.neighborId;
      const target = row.direction === "outgoing" ? row.neighborId : first.startId;
      edgesArr.push({
        source,
        target,
        type: row.relType,
        properties: row.relProps,
      });
    }

    return NextResponse.json({
      nodes: Array.from(nodesMap.values()),
      edges: edgesArr,
      center: centerNode,
    } satisfies GraphData);
  } catch (error) {
    console.error("Graph neighbors error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch graph neighbors", detail: message },
      { status: 500 }
    );
  }
}
