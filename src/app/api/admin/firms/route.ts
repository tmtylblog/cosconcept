import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { neo4jRead } from "@/lib/neo4j";

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
}

/**
 * GET /api/admin/firms?source=all|platform|graph
 * Universal firm directory: queries Neo4j knowledge graph + PostgreSQL platform data.
 * - source=platform (default): Only firms that are platform customers (PostgreSQL service_firms)
 * - source=graph: Only firms from Neo4j knowledge graph (not necessarily on platform)
 * - source=all: Combined view from both sources, deduplicated by firm ID
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
    // Platform firms from PostgreSQL (service_firms + imported_companies)
    if (source === "platform" || source === "all") {
      const searchFilter = search
        ? sql` AND (name ILIKE ${"%" + search + "%"} OR website ILIKE ${"%" + search + "%"})`
        : sql``;

      // Union service_firms and imported_companies into a single result set
      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT sf.id FROM service_firms sf WHERE 1=1 ${searchFilter}
          UNION ALL
          SELECT ic.id FROM imported_companies ic
          WHERE 1=1 ${search ? sql` AND (ic.name ILIKE ${"%" + search + "%"} OR ic.domain ILIKE ${"%" + search + "%"})` : sql``}
        ) combined
      `);
      const totalPlatform = Number(countResult.rows[0]?.total ?? 0);

      const platformResult = await db.execute(sql`
        SELECT * FROM (
          SELECT
            sf.id,
            sf.name,
            sf.website,
            sf.description,
            sf.firm_type AS "firmType",
            sf.size_band AS "sizeBand",
            sf.profile_completeness AS "profileCompleteness",
            sf.is_platform_member AS "isPlatformMember",
            sf.organization_id AS "organizationId",
            sf.created_at AS "createdAt",
            o.name AS "orgName",
            o.slug AS "orgSlug",
            NULL AS "location",
            NULL AS "industry",
            NULL AS "employeeCount",
            'service_firm' AS "dataSource"
          FROM service_firms sf
          LEFT JOIN organizations o ON o.id = sf.organization_id
          WHERE 1=1 ${searchFilter}

          UNION ALL

          SELECT
            ic.id,
            ic.name,
            ic.domain AS website,
            ic.description,
            ic.icp_classification AS "firmType",
            ic.size AS "sizeBand",
            NULL::real AS "profileCompleteness",
            false AS "isPlatformMember",
            NULL AS "organizationId",
            ic.created_at AS "createdAt",
            NULL AS "orgName",
            NULL AS "orgSlug",
            ic.location,
            ic.industry,
            ic.size AS "employeeCount",
            'imported' AS "dataSource"
          FROM imported_companies ic
          WHERE 1=1 ${search ? sql` AND (ic.name ILIKE ${"%" + search + "%"} OR ic.domain ILIKE ${"%" + search + "%"})` : sql``}
        ) combined
        ORDER BY "createdAt" DESC
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

    // Neo4j knowledge graph firms (ServiceFirm + Company nodes)
    if (source === "graph" || source === "all") {
      const params: Record<string, unknown> = {
        skip: neo4jInt(offset),
        lim: neo4jInt(limit),
      };
      if (search) {
        params.nameRegex = `(?i).*${escapeRegex(search)}.*`;
      }

      const countQuery = `
        MATCH (f)
        WHERE (f:ServiceFirm OR f:Company)
        ${search ? "AND f.name =~ $nameRegex" : ""}
        RETURN count(f) AS total
      `;
      const countRows = await neo4jRead<{ total: { low: number } }>(countQuery, params);
      const totalGraph = countRows[0]?.total?.low ?? (typeof countRows[0]?.total === "number" ? countRows[0].total : 0);

      const query = `
        MATCH (f)
        WHERE (f:ServiceFirm OR f:Company)
        ${search ? "AND f.name =~ $nameRegex" : ""}
        OPTIONAL MATCH (f)-[:IN_CATEGORY]->(c:Category)
        OPTIONAL MATCH (f)-[:SERVES_INDUSTRY]->(i:Industry)
        OPTIONAL MATCH (f)-[:OPERATES_IN]->(m:Market)
        OPTIONAL MATCH (f)-[:IS_FIRM_TYPE]->(ft:FirmType)
        RETURN f.id AS id,
               f.name AS name,
               f.website AS website,
               f.description AS description,
               f.employeeCount AS employeeCount,
               f.foundedYear AS foundedYear,
               f.location AS location,
               f.industry AS industry,
               f.sourceId AS sourceId,
               labels(f) AS labels,
               COLLECT(DISTINCT c.name) AS categories,
               COLLECT(DISTINCT i.name) AS industries,
               COLLECT(DISTINCT m.name) AS markets,
               ft.name AS firmType
        ORDER BY f.name ASC
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

      // source === "all": merge both
      const platformResult = await db.execute(sql`
        SELECT * FROM (
          SELECT
            sf.id,
            sf.name,
            sf.website,
            sf.description,
            sf.firm_type AS "firmType",
            sf.size_band AS "sizeBand",
            sf.profile_completeness AS "profileCompleteness",
            sf.is_platform_member AS "isPlatformMember",
            sf.organization_id AS "organizationId",
            sf.created_at AS "createdAt",
            o.name AS "orgName",
            o.slug AS "orgSlug",
            'service_firm' AS "dataSource"
          FROM service_firms sf
          LEFT JOIN organizations o ON o.id = sf.organization_id

          UNION ALL

          SELECT
            ic.id,
            ic.name,
            ic.domain AS website,
            ic.description,
            ic.icp_classification AS "firmType",
            ic.size AS "sizeBand",
            NULL::real AS "profileCompleteness",
            false AS "isPlatformMember",
            NULL AS "organizationId",
            ic.created_at AS "createdAt",
            NULL AS "orgName",
            NULL AS "orgSlug",
            'imported' AS "dataSource"
          FROM imported_companies ic
        ) combined
        ORDER BY "createdAt" DESC
      `);

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
    return NextResponse.json(
      { error: "Failed to fetch firms" },
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
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function neo4jInt(n: number) {
  // Neo4j driver expects native integers for SKIP/LIMIT
  return n;
}
