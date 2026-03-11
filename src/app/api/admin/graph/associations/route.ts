import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { neo4jRead } from "@/lib/neo4j";
import neo4j from "neo4j-driver";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/graph/associations?nodeId=X&nodeType=ServiceFirm|Company&assocType=firms|experts|caseStudies
 *
 * Returns associated nodes for a given graph node.
 *
 * Track A update:
 * - Organization → ServiceFirm (or Company:ServiceFirm)
 * - User → Person
 * - WORKED_AT → CURRENTLY_AT
 * - WORKED_WITH → HAS_CLIENT (ServiceFirm→Company)
 * - BY_FIRM → BY_FIRM (unchanged)
 * - Backward-compatible: still accepts Organization/Company nodeType for legacy data
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nodeId = req.nextUrl.searchParams.get("nodeId");
  const nodeType = req.nextUrl.searchParams.get("nodeType") ?? "ServiceFirm";
  const assocType = req.nextUrl.searchParams.get("assocType");
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10)));

  if (!nodeId || !assocType) {
    return NextResponse.json({ error: "nodeId and assocType required" }, { status: 400 });
  }

  try {
    const params: Record<string, unknown> = {
      nodeId,
      lim: neo4j.int(limit),
    };

    let cypher: string;

    // ServiceFirm / Organization queries (service provider node)
    if (nodeType === "ServiceFirm" || nodeType === "Organization") {
      // Try matching by multiple ID strategies for compatibility
      const matchClause = `
        OPTIONAL MATCH (o:ServiceFirm {id: $nodeId})
        WITH o
        WHERE o IS NOT NULL
        UNION ALL
        OPTIONAL MATCH (o:ServiceFirm) WHERE o.legacyId = $nodeId OR o.domain = $nodeId
        WITH o
        WHERE o IS NOT NULL
        UNION ALL
        OPTIONAL MATCH (o:Organization {legacyId: $nodeId})
        WITH o
        WHERE o IS NOT NULL
      `;
      // Simplified: try both ServiceFirm and legacy Organization by ID
      const nodeMatch = `
        CALL {
          MATCH (n:ServiceFirm) WHERE n.id = $nodeId OR n.legacyId = $nodeId OR n.domain = $nodeId
          RETURN n
          UNION
          MATCH (n:Organization) WHERE n.legacyId = $nodeId OR n.name = $nodeId
          RETURN n
        }
        WITH n LIMIT 1
      `;

      switch (assocType) {
        case "experts":
          cypher = `
            ${nodeMatch}
            OPTIONAL MATCH (n)<-[:CURRENTLY_AT|WORKED_AT]-(p)
            WHERE p:Person OR p:User
            RETURN p.name AS name, p.title AS title, p.email AS email,
                   coalesce(p.id, p.legacyId, p.name) AS id
            ORDER BY name ASC
            LIMIT $lim
          `;
          break;
        case "caseStudies":
          cypher = `
            ${nodeMatch}
            OPTIONAL MATCH (n)<-[:BY_FIRM]-(cs:CaseStudy)
            RETURN cs.title AS title, cs.summary AS summary,
                   coalesce(cs.id, cs.legacyId, cs.title) AS id
            ORDER BY title ASC
            LIMIT $lim
          `;
          break;
        case "clients":
          cypher = `
            ${nodeMatch}
            OPTIONAL MATCH (n)-[:HAS_CLIENT|WORKED_WITH]->(c:Company)
            WHERE NOT c:ServiceFirm
            RETURN c.name AS name, c.industry AS industry,
                   coalesce(c.id, c.legacyId, c.domain, c.name) AS id
            ORDER BY name ASC
            LIMIT $lim
          `;
          break;
        default:
          return NextResponse.json({ error: "Invalid assocType" }, { status: 400 });
      }
    } else if (nodeType === "Company") {
      // Client company node — find associated service firms and case studies
      const nodeMatch = `
        CALL {
          MATCH (c:Company) WHERE c.id = $nodeId OR c.legacyId = $nodeId OR c.domain = $nodeId
          RETURN c
        }
        WITH c LIMIT 1
      `;

      switch (assocType) {
        case "firms":
          cypher = `
            ${nodeMatch}
            OPTIONAL MATCH (c)<-[:HAS_CLIENT|WORKED_WITH]-(o)
            WHERE o:ServiceFirm OR o:Organization
            RETURN o.name AS name, o.website AS website,
                   coalesce(o.id, o.legacyId, o.name) AS id
            ORDER BY name ASC
            LIMIT $lim
          `;
          break;
        case "caseStudies":
          cypher = `
            ${nodeMatch}
            OPTIONAL MATCH (c)<-[:FOR_CLIENT]-(cs:CaseStudy)
            RETURN cs.title AS title, cs.summary AS summary,
                   coalesce(cs.id, cs.legacyId, cs.title) AS id
            ORDER BY title ASC
            LIMIT $lim
          `;
          break;
        default:
          return NextResponse.json({ error: "Invalid assocType for Company" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Invalid nodeType" }, { status: 400 });
    }

    const results = await neo4jRead<Record<string, unknown>>(cypher, params);
    // Filter out null rows (from OPTIONAL MATCH with no results)
    const filtered = results.filter((r) => r.id != null);

    return NextResponse.json({ items: filtered, total: filtered.length });
  } catch (error) {
    console.error("[Admin] Graph associations error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch associations", detail: message },
      { status: 500 }
    );
  }
}
