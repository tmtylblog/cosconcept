/**
 * GET /api/admin/neo4j/health
 *
 * Returns graph health statistics: node/edge counts by type,
 * client stub coverage, stale data detection.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { neo4jRead } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

/** Helper: convert Neo4j integer to JS number */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNum(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toNumber === "function") return v.toNumber();
  return Number(v) || 0;
}

export async function GET() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!session?.user || !["admin", "superadmin"].includes((session.user as any).role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Node counts for key types
    const labels = [
      "Company", "ServiceFirm", "Person", "Skill", "Industry",
      "Market", "Language", "FirmCategory", "Service", "CaseStudy",
    ];
    const nodeCounts: { label: string; count: number }[] = [];
    for (const label of labels) {
      const result = await neo4jRead<{ cnt: unknown }>(
        `MATCH (n:${label}) RETURN count(n) AS cnt`,
        {}
      );
      nodeCounts.push({ label, count: toNum(result?.[0]?.cnt) });
    }

    // Edge counts by type
    const edgeLabels = [
      "HAS_SKILL", "SERVES_INDUSTRY", "OPERATES_IN", "SPEAKS",
      "IN_CATEGORY", "OFFERS_SERVICE", "HAS_CLIENT", "CURRENTLY_AT",
      "WORKED_AT", "DEMONSTRATES_SKILL", "FOR_CLIENT", "IN_INDUSTRY",
      "HAS_CASE_STUDY",
    ];
    const edgeCounts: { type: string; count: number }[] = [];
    for (const type of edgeLabels) {
      const result = await neo4jRead<{ cnt: unknown }>(
        `MATCH ()-[r:${type}]->() RETURN count(r) AS cnt`,
        {}
      );
      edgeCounts.push({ type, count: toNum(result?.[0]?.cnt) });
    }

    // Total ServiceFirm nodes
    const sfResult = await neo4jRead<{ total: unknown }>(
      `MATCH (f:Company:ServiceFirm)
       WHERE f.isCosCustomer = true
       RETURN count(f) AS total`,
      {}
    );
    const totalServiceFirms = toNum(sfResult?.[0]?.total);

    // Client stub stats
    const stubResult = await neo4jRead<{ total: unknown; stubs: unknown; enriched: unknown }>(
      `MATCH (c:Company)
       WHERE NOT c:ServiceFirm
       WITH c,
            CASE WHEN c.enrichmentStatus = 'stub' THEN 1 ELSE 0 END AS isStub,
            CASE WHEN c.enrichmentStatus IN ['enriched', 'researched', 'complete'] THEN 1 ELSE 0 END AS isEnriched
       RETURN count(c) AS total,
              sum(isStub) AS stubs,
              sum(isEnriched) AS enriched`,
      {}
    );
    const clientStats = {
      total: toNum(stubResult?.[0]?.total),
      stubs: toNum(stubResult?.[0]?.stubs),
      enriched: toNum(stubResult?.[0]?.enriched),
      coverage: 0,
    };
    clientStats.coverage = clientStats.total > 0
      ? Math.round((clientStats.enriched / clientStats.total) * 100)
      : 0;

    // Stale data: ServiceFirm nodes not updated in 30 days
    const staleResult = await neo4jRead<{ stale: unknown }>(
      `MATCH (f:Company:ServiceFirm)
       WHERE f.updatedAt IS NOT NULL AND f.updatedAt < datetime() - duration('P30D')
       RETURN count(f) AS stale`,
      {}
    );
    const staleCount = toNum(staleResult?.[0]?.stale);

    return NextResponse.json({
      nodeCounts: nodeCounts.filter((n) => n.count > 0).sort((a, b) => b.count - a.count),
      edgeCounts: edgeCounts.filter((e) => e.count > 0).sort((a, b) => b.count - a.count),
      totalServiceFirms,
      clientStats,
      staleCount,
    });
  } catch (error) {
    console.error("[Neo4jHealth] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch graph health" },
      { status: 500 }
    );
  }
}
