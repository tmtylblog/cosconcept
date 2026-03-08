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
    // Platform firms from PostgreSQL (service_firms + optional imported_companies)
    if (source === "platform" || source === "all") {
      const searchFilter = search
        ? sql` AND (sf.name ILIKE ${"%" + search + "%"} OR sf.website ILIKE ${"%" + search + "%"})`
        : sql``;

      let totalPlatform: number;
      let platformResult: { rows: Record<string, unknown>[] };

      // Query service_firms first (always exists)
      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total FROM service_firms sf WHERE 1=1 ${searchFilter}
      `);
      totalPlatform = Number(countResult.rows[0]?.total ?? 0);

      platformResult = await db.execute(sql`
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

      // Try to also fetch imported_companies (may not exist or have column issues)
      try {
        const icSearchFilter = search
          ? sql` WHERE (ic.name ILIKE ${"%" + search + "%"} OR ic.domain ILIKE ${"%" + search + "%"})`
          : sql``;
        const icCountResult = await db.execute(sql`
          SELECT COUNT(*)::int AS total FROM imported_companies ic ${icSearchFilter}
        `);
        const icTotal = Number(icCountResult.rows[0]?.total ?? 0);

        if (icTotal > 0) {
          const icResult = await db.execute(sql`
            SELECT
              ic.id, ic.name, ic.domain AS "website", ic.description,
              ic.icp_classification AS "firmType", ic.size AS "sizeBand",
              NULL::real AS "profileCompleteness", false AS "isPlatformMember",
              NULL::text AS "organizationId", ic.created_at AS "createdAt",
              NULL::text AS "orgName", NULL::text AS "orgSlug",
              'imported' AS "dataSource"
            FROM imported_companies ic
            ${icSearchFilter}
            ORDER BY ic.created_at DESC
            LIMIT ${limit} OFFSET ${Math.max(0, offset - totalPlatform)}
          `);

          // Only append imported companies if we've exhausted service_firms pages
          if (offset >= totalPlatform) {
            platformResult = { rows: icResult.rows };
          } else if (platformResult.rows.length < limit) {
            platformResult = { rows: [...platformResult.rows, ...icResult.rows].slice(0, limit) };
          }
          totalPlatform += icTotal;
        }
      } catch {
        // imported_companies table doesn't exist or has issues — skip silently
      }

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

    // Neo4j knowledge graph firms (ServiceFirm + Company + Organization nodes)
    if (source === "graph" || source === "all") {
      const params: Record<string, unknown> = {
        skip: neo4jInt(offset),
        lim: neo4jInt(limit),
      };
      if (search) {
        params.nameRegex = `(?i).*${escapeRegex(search)}.*`;
      }

      // Count ServiceFirm (enriched) + Organization (legacy) nodes
      // Note: Company nodes are client companies (Coca-Cola etc.), not service firms
      const countQuery = search
        ? `
          CALL {
            MATCH (f:ServiceFirm) WHERE f.name =~ $nameRegex RETURN count(f) AS c
            UNION ALL
            MATCH (o:Organization) WHERE o.name =~ $nameRegex RETURN count(o) AS c
          }
          RETURN sum(c) AS total
        `
        : `
          CALL {
            MATCH (f:ServiceFirm) RETURN count(f) AS c
            UNION ALL
            MATCH (o:Organization) RETURN count(o) AS c
          }
          RETURN sum(c) AS total
        `;
      const countRows = await neo4jRead<{ total: { low: number } }>(countQuery, params);
      const totalGraph = countRows[0]?.total?.low ?? (typeof countRows[0]?.total === "number" ? countRows[0].total : 0);

      // Main query: query Organization nodes (legacy firms), with optional ServiceFirm results
      // Neo4j Aura doesn't support WITH after CALL{UNION}, so we query separately
      const query = search
        ? `
          MATCH (o:Organization)
          WHERE o.name =~ $nameRegex
          OPTIONAL MATCH (o)-[:IN_CATEGORY]->(c:Category)
          OPTIONAL MATCH (o)-[:OPERATES_IN_INDUSTRY]->(i:Industry)
          OPTIONAL MATCH (o)-[:LOCATED_IN]->(m:Market)
          RETURN coalesce(o.legacyId, o.name) AS id,
                 o.name AS name,
                 o.website AS website,
                 o.about AS description,
                 o.employees AS employeeCount,
                 null AS foundedYear,
                 COLLECT(DISTINCT c.name) AS categories,
                 COLLECT(DISTINCT i.name) AS industries,
                 COLLECT(DISTINCT m.name) AS markets,
                 null AS firmType,
                 'legacy' AS source,
                 o.isLegacy AS isLegacy,
                 o.isCollectiveOSCustomer AS isCustomer
          ORDER BY o.name ASC
          SKIP $skip LIMIT $lim
        `
        : `
          MATCH (o:Organization)
          OPTIONAL MATCH (o)-[:IN_CATEGORY]->(c:Category)
          OPTIONAL MATCH (o)-[:OPERATES_IN_INDUSTRY]->(i:Industry)
          OPTIONAL MATCH (o)-[:LOCATED_IN]->(m:Market)
          RETURN coalesce(o.legacyId, o.name) AS id,
                 o.name AS name,
                 o.website AS website,
                 o.about AS description,
                 o.employees AS employeeCount,
                 null AS foundedYear,
                 COLLECT(DISTINCT c.name) AS categories,
                 COLLECT(DISTINCT i.name) AS industries,
                 COLLECT(DISTINCT m.name) AS markets,
                 null AS firmType,
                 'legacy' AS source,
                 o.isLegacy AS isLegacy,
                 o.isCollectiveOSCustomer AS isCustomer
          ORDER BY o.name ASC
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
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function neo4jInt(n: number) {
  return neo4j.int(n);
}
