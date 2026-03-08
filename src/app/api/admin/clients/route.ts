import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { neo4jRead } from "@/lib/neo4j";
import neo4j from "neo4j-driver";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/clients?q=&page=1&limit=50
 *
 * Lists Company nodes from Neo4j (client companies like Coca-Cola, ESPN).
 * Now returns enriched properties (logo, description, employees, revenue, etc.)
 * that were synced from PDL/Clearbit enrichment.
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

  const search = req.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  try {
    const params: Record<string, unknown> = {
      skip: neo4j.int(offset),
      lim: neo4j.int(limit),
    };

    let countCypher: string;
    let listCypher: string;

    const returnClause = `
      RETURN c.name AS name,
             coalesce(c.legacyId, c.name) AS id,
             c.industry AS industry,
             c.website AS website,
             c.domain AS domain,
             c.logoUrl AS logoUrl,
             c.description AS description,
             c.sector AS sector,
             c.subIndustry AS subIndustry,
             c.employeeCount AS employeeCount,
             c.employeeCountExact AS employeeCountExact,
             c.employeeRange AS employeeRange,
             c.estimatedRevenue AS estimatedRevenue,
             c.location AS location,
             c.city AS city,
             c.state AS state,
             c.country AS country,
             c.companyType AS companyType,
             c.foundedYear AS foundedYear,
             c.linkedinUrl AS linkedinUrl,
             c.tags AS tags,
             c.techStack AS techStack,
             c.fundingRaised AS fundingRaised,
             c.enrichedAt AS enrichedAt,
             count(DISTINCT o) AS serviceFirmCount,
             count(DISTINCT cs) AS caseStudyCount
    `;

    if (search) {
      params.nameRegex = `(?i).*${escapeRegex(search)}.*`;
      countCypher = `MATCH (c:Company) WHERE c.name =~ $nameRegex RETURN count(c) AS total`;
      listCypher = `
        MATCH (c:Company)
        WHERE c.name =~ $nameRegex
        OPTIONAL MATCH (c)<-[:WORKED_WITH]-(o:Organization)
        OPTIONAL MATCH (c)<-[:FOR_CLIENT]-(cs:CaseStudy)
        ${returnClause}
        ORDER BY c.name ASC
        SKIP $skip LIMIT $lim
      `;
    } else {
      countCypher = `MATCH (c:Company) RETURN count(c) AS total`;
      listCypher = `
        MATCH (c:Company)
        OPTIONAL MATCH (c)<-[:WORKED_WITH]-(o:Organization)
        OPTIONAL MATCH (c)<-[:FOR_CLIENT]-(cs:CaseStudy)
        ${returnClause}
        ORDER BY c.name ASC
        SKIP $skip LIMIT $lim
      `;
    }

    const countRows = await neo4jRead<{ total: { low: number } }>(countCypher, params);
    const total = countRows[0]?.total?.low ?? (typeof countRows[0]?.total === "number" ? (countRows[0].total as number) : 0);

    const clients = await neo4jRead<{
      name: string;
      id: string;
      industry: string | null;
      website: string | null;
      domain: string | null;
      logoUrl: string | null;
      description: string | null;
      sector: string | null;
      subIndustry: string | null;
      employeeCount: string | null;
      employeeCountExact: { low: number } | number | null;
      employeeRange: string | null;
      estimatedRevenue: string | null;
      location: string | null;
      city: string | null;
      state: string | null;
      country: string | null;
      companyType: string | null;
      foundedYear: { low: number } | number | null;
      linkedinUrl: string | null;
      tags: string[] | null;
      techStack: string[] | null;
      fundingRaised: string | null;
      enrichedAt: string | null;
      serviceFirmCount: { low: number } | number;
      caseStudyCount: { low: number } | number;
    }>(listCypher, params);

    return NextResponse.json({
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name?.trim(),
        domain: c.domain,
        logoUrl: c.logoUrl,
        description: c.description,
        industry: c.industry,
        sector: c.sector,
        subIndustry: c.subIndustry,
        website: c.website,
        employeeCount: c.employeeCount,
        employeeCountExact: toNum(c.employeeCountExact),
        employeeRange: c.employeeRange,
        estimatedRevenue: c.estimatedRevenue,
        location: c.location,
        city: c.city,
        state: c.state,
        country: c.country,
        companyType: c.companyType,
        foundedYear: toNum(c.foundedYear),
        linkedinUrl: c.linkedinUrl,
        tags: c.tags,
        techStack: c.techStack,
        fundingRaised: c.fundingRaised,
        enrichedAt: c.enrichedAt,
        serviceFirmName: null, // Could be computed from relationships
        serviceFirmCount: toNum(c.serviceFirmCount),
        caseStudyCount: toNum(c.caseStudyCount),
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("[Admin] Clients error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch clients", detail: message },
      { status: 500 }
    );
  }
}

function toNum(val: { low: number } | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  return val.low ?? 0;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
