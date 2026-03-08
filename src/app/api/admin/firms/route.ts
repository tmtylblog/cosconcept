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
    // Platform firms from PostgreSQL
    if (source === "platform" || source === "all") {
      const searchFilter = search
        ? sql` AND (sf.name ILIKE ${"%" + search + "%"} OR sf.website ILIKE ${"%" + search + "%"})`
        : sql``;

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM service_firms sf
        WHERE 1=1 ${searchFilter}
      `);
      const totalPlatform = Number(countResult.rows[0]?.total ?? 0);

      const platformResult = await db.execute(sql`
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
          o.slug AS "orgSlug"
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

    // Neo4j knowledge graph firms
    if (source === "graph" || source === "all") {
      const searchClause = search
        ? `WHERE f.name =~ $nameRegex`
        : "";
      const params: Record<string, unknown> = {
        skip: neo4jInt(offset),
        lim: neo4jInt(limit),
      };
      if (search) {
        params.nameRegex = `(?i).*${escapeRegex(search)}.*`;
      }

      const countQuery = `
        MATCH (f:ServiceFirm)
        ${searchClause}
        RETURN count(f) AS total
      `;
      const countRows = await neo4jRead<{ total: { low: number } }>(countQuery, params);
      const totalGraph = countRows[0]?.total?.low ?? (typeof countRows[0]?.total === "number" ? countRows[0].total : 0);

      const query = `
        MATCH (f:ServiceFirm)
        ${searchClause}
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
          o.slug AS "orgSlug"
        FROM service_firms sf
        LEFT JOIN organizations o ON o.id = sf.organization_id
        ORDER BY sf.created_at DESC
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
    industries: gf.industries ?? [],
    markets: gf.markets ?? [],
    firmType: gf.firmType,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function neo4jInt(n: number) {
  // Neo4j driver expects native integers for SKIP/LIMIT
  return n;
}
