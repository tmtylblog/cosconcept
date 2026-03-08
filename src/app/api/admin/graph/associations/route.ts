import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { neo4jRead } from "@/lib/neo4j";
import neo4j from "neo4j-driver";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/graph/associations?nodeId=X&nodeType=Organization|Company&assocType=firms|experts|caseStudies
 * Returns associated nodes for a given graph node.
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
  const nodeType = req.nextUrl.searchParams.get("nodeType") ?? "Organization";
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

    if (nodeType === "Organization") {
      switch (assocType) {
        case "experts":
          cypher = `
            MATCH (o:Organization {legacyId: $nodeId})
            OPTIONAL MATCH (o)<-[:WORKED_AT]-(u:User)
            RETURN u.name AS name, u.title AS title, u.email AS email,
                   coalesce(u.legacyId, u.name) AS id
            ORDER BY u.name ASC
            LIMIT $lim
          `;
          break;
        case "caseStudies":
          cypher = `
            MATCH (o:Organization {legacyId: $nodeId})
            OPTIONAL MATCH (o)<-[:BY_FIRM]-(cs:CaseStudy)
            RETURN cs.title AS title, cs.summary AS summary,
                   coalesce(cs.legacyId, cs.title) AS id
            ORDER BY cs.title ASC
            LIMIT $lim
          `;
          break;
        case "clients":
          cypher = `
            MATCH (o:Organization {legacyId: $nodeId})
            OPTIONAL MATCH (o)-[:WORKED_WITH]->(c:Company)
            RETURN c.name AS name, c.industry AS industry,
                   coalesce(c.legacyId, c.name) AS id
            ORDER BY c.name ASC
            LIMIT $lim
          `;
          break;
        default:
          return NextResponse.json({ error: "Invalid assocType" }, { status: 400 });
      }
    } else if (nodeType === "Company") {
      switch (assocType) {
        case "firms":
          cypher = `
            MATCH (c:Company {legacyId: $nodeId})
            OPTIONAL MATCH (c)<-[:WORKED_WITH]-(o:Organization)
            RETURN o.name AS name, o.website AS website,
                   coalesce(o.legacyId, o.name) AS id
            ORDER BY o.name ASC
            LIMIT $lim
          `;
          break;
        case "caseStudies":
          cypher = `
            MATCH (c:Company {legacyId: $nodeId})
            OPTIONAL MATCH (c)<-[:FOR_CLIENT]-(cs:CaseStudy)
            RETURN cs.title AS title, cs.summary AS summary,
                   coalesce(cs.legacyId, cs.title) AS id
            ORDER BY cs.title ASC
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
