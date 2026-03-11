import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { neo4jRead } from "@/lib/neo4j";
import neo4j from "neo4j-driver";

export const dynamic = "force-dynamic";

interface Neo4jFirm {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  employeeCount: number | null;
  foundedYear: number | null;
  categories: string[];
  industries: string[];
  markets: string[];
  firmType: string | null;
  labels?: string[];
  location?: string | null;
  industry?: string | null;
  sourceId?: string | null;
  source?: string;
  isLegacy?: boolean;
  isCustomer?: boolean;
  expertCount?: number | { low: number } | null;
  caseStudyCount?: number | { low: number } | null;
  clientCount?: number | { low: number } | null;
}

/**
 * GET /api/admin/firms?source=all|platform|graph
 * Universal firm directory: queries Neo4j knowledge graph + PostgreSQL platform data.
 * - source=platform (default): Only firms that are platform customers (PostgreSQL service_firms)
 * - source=graph: Only firms from Neo4j knowledge graph (not necessarily on platform)
 * - source=all: Combined view from both sources, deduplicated by firm ID
 *
 * Track A update:
 * - Platform source no longer queries truncated imported_companies
 * - Graph source queries both ServiceFirm (new) and Organization (legacy) nodes
 * - WORKED_AT → CURRENTLY_AT, Category → FirmCategory, WORKED_WITH → HAS_CLIENT
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

  const source = req.nextUrl.searchParams.get("source") ?? "platform";
  const search = req.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  try {
    // Platform firms from PostgreSQL (service_firms only — imported_companies truncated)
    if (source === "platform" || source === "all") {
      const searchFilter = search
        ? sql` AND (sf.name ILIKE ${"%" + search + "%"} OR sf.website ILIKE ${"%" + search + "%"})`
        : sql``;

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total FROM service_firms sf WHERE 1=1 ${searchFilter}
      `);
      const totalPlatform = Number(countResult.rows[0]?.total ?? 0);

      const platformResult = await db.execute(sql`
        SELECT
          sf.id, sf.name, sf.website, sf.description,
          sf.firm_type AS "firmType", sf.size_band AS "sizeBand",
          sf.profile_completeness AS "profileCompleteness",
          sf.is_platform_member AS "isPlatformMember",
          sf.organization_id AS "organizationId",
          sf.created_at AS "createdAt",
          o.name AS "orgName", o.slug AS "orgSlug",
          'service_firm' AS "dataSource"
        FROM service_firms sf
        LEFT JOIN organizations o ON o.id = sf.organization_id
        WHERE 1=1 ${searchFilter}
        ORDER BY sf.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      if (source === "platform") {
        return NextResponse.json({
          source: "platform",
          firms: platformResult.rows,
          total: totalPlatform,
          page,
          limit,
        });
      }
    }

    // Neo4j knowledge graph firms (ServiceFirm + Organization nodes)
    if (source === "graph" || source === "all") {
      const params: Record<string, unknown> = {
        skip: neo4jInt(offset),
        lim: neo4jInt(limit),
      };
      if (search) {
        params.nameRegex = `(?i).*${escapeRegex(search)}.*`;
      }

      // Count both ServiceFirm (new) and Organization (legacy) nodes
      const countQuery = search
        ? `
          CALL {
            MATCH (f:ServiceFirm) WHERE f.name =~ $nameRegex RETURN count(f) AS c
            UNION ALL
            MATCH (o:Organization) WHERE o.name =~ $nameRegex AND NOT o:ServiceFirm RETURN count(o) AS c
          }
          RETURN sum(c) AS total
        `
        : `
          CALL {
            MATCH (f:ServiceFirm) RETURN count(f) AS c
            UNION ALL
            MATCH (o:Organization) WHERE NOT o:ServiceFirm RETURN count(o) AS c
          }
          RETURN sum(c) AS total
        `;
      const countRows = await neo4jRead<{ total: { low: number } }>(countQuery, params);
      const totalGraph = countRows[0]?.total?.low ?? (typeof countRows[0]?.total === "number" ? countRows[0].total : 0);

      // Main query: ServiceFirm nodes (new) with association counts
      // Falls back to Organization nodes for legacy data
      const searchWhere = search ? `WHERE n.name =~ $nameRegex` : "";
      const query = `
        CALL {
          MATCH (n:ServiceFirm)
          ${searchWhere}
          RETURN n, labels(n) AS nodeLabels
          UNION
          MATCH (n:Organization) WHERE NOT n:ServiceFirm
          ${searchWhere}
          RETURN n, labels(n) AS nodeLabels
        }
        WITH n, nodeLabels
        OPTIONAL MATCH (n)-[:IN_CATEGORY|IN_FIRM_CATEGORY]->(c)
        WHERE c:Category OR c:FirmCategory
        OPTIONAL MATCH (n)-[:OPERATES_IN_INDUSTRY]->(i:Industry)
        OPTIONAL MATCH (n)-[:LOCATED_IN]->(m:Market)
        WITH n, nodeLabels,
             COLLECT(DISTINCT c.name) AS categories,
             COLLECT(DISTINCT i.name) AS industries,
             COLLECT(DISTINCT m.name) AS markets
        OPTIONAL MATCH (n)<-[:CURRENTLY_AT|WORKED_AT]-(expert)
        WHERE expert:Person OR expert:User
        WITH n, nodeLabels, categories, industries, markets,
             count(DISTINCT expert) AS expertCount
        OPTIONAL MATCH (n)<-[:BY_FIRM]-(cs:CaseStudy)
        WITH n, nodeLabels, categories, industries, markets, expertCount,
             count(DISTINCT cs) AS caseStudyCount
        OPTIONAL MATCH (n)-[:HAS_CLIENT|WORKED_WITH]->(client:Company)
        WHERE NOT client:ServiceFirm
        RETURN coalesce(n.id, n.legacyId, n.name) AS id,
               n.name AS name,
               n.website AS website,
               coalesce(n.about, n.description) AS description,
               n.employees AS employeeCount,
               null AS foundedYear,
               categories,
               industries,
               markets,
               null AS firmType,
               nodeLabels AS labels,
               n.location AS location,
               n.industry AS industry,
               CASE WHEN 'Organization' IN nodeLabels AND NOT 'ServiceFirm' IN nodeLabels
                 THEN 'legacy' ELSE 'enriched' END AS source,
               CASE WHEN 'Organization' IN nodeLabels AND NOT 'ServiceFirm' IN nodeLabels
                 THEN true ELSE false END AS isLegacy,
               coalesce(n.isCollectiveOSCustomer, n.isCosCustomer, false) AS isCustomer,
               expertCount,
               caseStudyCount,
               count(DISTINCT client) AS clientCount
        ORDER BY n.name ASC
        SKIP $skip LIMIT $lim
      `;

      const graphFirms = await neo4jRead<Neo4jFirm>(query, params);

      if (source === "graph") {
        return NextResponse.json({
          source: "graph",
          firms: graphFirms.map(normalizeFirm),
          total: totalGraph,
          page,
          limit,
        });
      }

      // source === "all": get platform firms (service_firms only for merge)
      const allPlatformResult = await db.execute(sql`
        SELECT
          sf.id, sf.name, sf.website, sf.description,
          sf.firm_type AS "firmType", sf.size_band AS "sizeBand",
          sf.profile_completeness AS "profileCompleteness",
          sf.is_platform_member AS "isPlatformMember",
          sf.organization_id AS "organizationId",
          sf.created_at AS "createdAt",
          o.name AS "orgName", o.slug AS "orgSlug",
          'service_firm' AS "dataSource"
        FROM service_firms sf
        LEFT JOIN organizations o ON o.id = sf.organization_id
        ORDER BY sf.created_at DESC
      `);
      const platformResult = allPlatformResult;

      // Cross-reference: mark graph firms that are also platform members
      const platformIds = new Set(platformResult.rows.map((r) => r.id));
      const merged = graphFirms.map((gf) => ({
        ...normalizeFirm(gf),
        onPlatform: platformIds.has(gf.id),
        platformData: platformResult.rows.find((pf) => pf.id === gf.id) ?? null,
      }));

      // Add platform-only firms not in Neo4j
      for (const pf of platformResult.rows) {
        const inGraph = graphFirms.some((gf) => gf.id === pf.id);
        if (!inGraph) {
          merged.push({
            id: pf.id as string,
            name: pf.name as string,
            website: pf.website as string | null,
            description: pf.description as string | null,
            employeeCount: null,
            foundedYear: null,
            categories: [],
            industries: [],
            markets: [],
            firmType: pf.firmType as string | null,
            location: null,
            labels: [],
            source: "platform",
            isLegacy: false,
            isCustomer: true,
            expertCount: 0,
            caseStudyCount: 0,
            clientCount: 0,
            onPlatform: true,
            platformData: pf,
          });
        }
      }

      return NextResponse.json({
        source: "all",
        firms: merged,
        totalGraph,
        totalPlatform: platformResult.rows.length,
        page,
        limit,
      });
    }

    return NextResponse.json({ error: "Invalid source parameter" }, { status: 400 });
  } catch (error) {
    console.error("[Admin] Firms directory error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch firms", detail: message },
      { status: 500 }
    );
  }
}

function normalizeFirm(gf: Neo4jFirm) {
  return {
    id: gf.id,
    name: gf.name,
    website: gf.website,
    description: gf.description,
    employeeCount: typeof gf.employeeCount === "object" && gf.employeeCount !== null
      ? (gf.employeeCount as unknown as { low: number }).low
      : gf.employeeCount,
    foundedYear: typeof gf.foundedYear === "object" && gf.foundedYear !== null
      ? (gf.foundedYear as unknown as { low: number }).low
      : gf.foundedYear,
    categories: gf.categories ?? [],
    industries: gf.industries ? [...(gf.industries), ...(gf.industry ? [gf.industry] : [])].filter((v, i, a) => a.indexOf(v) === i) : (gf.industry ? [gf.industry] : []),
    markets: gf.markets ?? [],
    firmType: gf.firmType,
    location: gf.location ?? null,
    labels: gf.labels ?? [],
    source: gf.source ?? "enriched",
    isLegacy: gf.isLegacy ?? false,
    isCustomer: gf.isCustomer ?? false,
    expertCount: neo4jToNum(gf.expertCount),
    caseStudyCount: neo4jToNum(gf.caseStudyCount),
    clientCount: neo4jToNum(gf.clientCount),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function neo4jInt(n: number) {
  return neo4j.int(n);
}

function neo4jToNum(val: number | { low: number } | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  return val.low ?? 0;
}
