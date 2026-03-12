/**
 * GET /api/graph/search
 *
 * Search graph nodes by name (case-insensitive substring match).
 *
 * Query params:
 *   q     — search term (required)
 *   type  — optional node type filter (ServiceFirm, Skill, etc.)
 *   limit — max results (default 20, max 50)
 */

import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { neo4jRead } from "@/lib/neo4j";
import type { SearchResult, NodeType } from "@/lib/graph/types";

const SEARCHABLE_LABELS = [
  "ServiceFirm",
  "Skill",
  "Category",
  "FirmCategory",
  "Industry",
  "Market",
  "CaseStudy",
  "Person",
  "Client",
];

interface NeoSearchRow {
  id: string;
  name: string;
  nodeLabels: string[];
}

function primaryLabel(labels: string[]): NodeType {
  for (const l of SEARCHABLE_LABELS) {
    if (labels.includes(l)) return l as NodeType;
  }
  return (labels[0] ?? "Unknown") as NodeType;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q")?.trim();
    const typeFilter = url.searchParams.get("type") as NodeType | null;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Build label filter
    const targetLabels = typeFilter ? [typeFilter] : SEARCHABLE_LABELS;

    const cypher = `
      MATCH (n)
      WHERE any(lbl IN labels(n) WHERE lbl IN $targetLabels)
        AND n.name IS NOT NULL
        AND toLower(n.name) CONTAINS toLower($query)
      RETURN elementId(n) as id, n.name as name, labels(n) as nodeLabels
      ORDER BY
        CASE WHEN toLower(n.name) = toLower($query) THEN 0
             WHEN toLower(n.name) STARTS WITH toLower($query) THEN 1
             ELSE 2
        END,
        n.name
      LIMIT $limit
    `;

    const rows = await neo4jRead<NeoSearchRow>(cypher, {
      query,
      targetLabels,
      limit: neo4j.int(limit),
    });

    const results: SearchResult[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: primaryLabel(row.nodeLabels),
      labels: row.nodeLabels,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Graph search error:", error);
    return NextResponse.json(
      { error: "Failed to search graph" },
      { status: 500 }
    );
  }
}
