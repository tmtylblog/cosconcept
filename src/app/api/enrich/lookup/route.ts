import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";
import { neo4jRead } from "@/lib/neo4j";
import { like, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/enrich/lookup
 *
 * Check our own data (PostgreSQL + Neo4j) before calling paid APIs.
 * If we've already enriched this domain, return the cached result.
 * This saves PDL credits, Jina calls, and AI classifier tokens.
 *
 * Returns:
 *   { found: true, source: "postgres"|"neo4j", data: EnrichmentResult }
 *   { found: false }
 */
export async function POST(req: Request) {
  try {
    const { domain } = (await req.json()) as { domain: string };

    if (!domain) {
      return NextResponse.json({ found: false });
    }

    // ─── 1. Check PostgreSQL (serviceFirms.enrichmentData) ───
    // Look for any firm with a matching website, regardless of org
    const pgResults = await db
      .select({
        enrichmentData: serviceFirms.enrichmentData,
        enrichmentStatus: serviceFirms.enrichmentStatus,
        name: serviceFirms.name,
        website: serviceFirms.website,
      })
      .from(serviceFirms)
      .where(
        or(
          like(serviceFirms.website, `%${domain}%`),
          like(serviceFirms.website, `%${domain}`)
        )
      )
      .limit(1);

    if (pgResults.length > 0 && pgResults[0].enrichmentData && pgResults[0].enrichmentStatus === "enriched") {
      console.log(`[Enrich/Lookup] Cache HIT (Postgres) for ${domain}: ${pgResults[0].name}`);
      return NextResponse.json({
        found: true,
        source: "postgres",
        data: pgResults[0].enrichmentData,
      });
    }

    // ─── 2. Check Neo4j (ServiceFirm node by website) ───
    try {
      const neo4jResults = await neo4jRead<{
        name: string;
        website: string;
        description: string | null;
        foundedYear: number | null;
        employeeCount: number | null;
        pdlIndustry: string | null;
        pdlLocation: string | null;
        logoUrl: string | null;
        categories: string[];
        skills: string[];
        industries: string[];
        markets: string[];
        languages: string[];
        services: string[];
        clients: string[];
      }>(
        `MATCH (f:ServiceFirm)
         WHERE f.website CONTAINS $domain
         OPTIONAL MATCH (f)-[:IN_CATEGORY]->(cat:Category)
         OPTIONAL MATCH (f)-[:HAS_SKILL]->(sk:Skill)
         OPTIONAL MATCH (f)-[:SERVES_INDUSTRY]->(ind:Industry)
         OPTIONAL MATCH (f)-[:OPERATES_IN]->(mkt:Market)
         OPTIONAL MATCH (f)-[:SPEAKS]->(lang:Language)
         OPTIONAL MATCH (f)-[:OFFERS_SERVICE]->(svc:Service)
         OPTIONAL MATCH (f)-[:HAS_CLIENT]->(cl:Client)
         RETURN f.name AS name,
                f.website AS website,
                f.description AS description,
                f.foundedYear AS foundedYear,
                f.employeeCount AS employeeCount,
                f.pdlIndustry AS pdlIndustry,
                f.pdlLocation AS pdlLocation,
                f.logoUrl AS logoUrl,
                collect(DISTINCT cat.name) AS categories,
                collect(DISTINCT sk.name) AS skills,
                collect(DISTINCT ind.name) AS industries,
                collect(DISTINCT mkt.name) AS markets,
                collect(DISTINCT lang.name) AS languages,
                collect(DISTINCT svc.name) AS services,
                collect(DISTINCT cl.name) AS clients
         LIMIT 1`,
        { domain }
      );

      if (neo4jResults.length > 0) {
        const r = neo4jResults[0];
        // Only count as a hit if we have meaningful data
        const hasData = r.categories.length > 0 || r.skills.length > 0 || r.employeeCount;
        if (hasData) {
          console.log(`[Enrich/Lookup] Cache HIT (Neo4j) for ${domain}: ${r.name}`);

          // Reconstruct an EnrichmentResult-compatible shape
          const data = {
            url: r.website || `https://${domain}`,
            domain,
            logoUrl: r.logoUrl || `https://logo.clearbit.com/${domain}`,
            success: true,
            companyCard: null,
            companyData: r.employeeCount
              ? {
                  name: r.name,
                  industry: r.pdlIndustry || "",
                  size: "",
                  employeeCount: typeof r.employeeCount === 'object'
                    ? (r.employeeCount as { low?: number }).low ?? 0
                    : r.employeeCount ?? 0,
                  founded: typeof r.foundedYear === 'object' && r.foundedYear !== null
                    ? (r.foundedYear as unknown as { low?: number }).low ?? null
                    : r.foundedYear ?? null,
                  location: r.pdlLocation || "",
                  tags: [],
                  inferredRevenue: null,
                  linkedinUrl: null,
                  website: r.website,
                }
              : null,
            groundTruth: null,
            pagesScraped: 0,
            evidenceCategories: [],
            extracted:
              r.services.length > 0 || r.clients.length > 0
                ? {
                    clients: r.clients,
                    caseStudyUrls: [],
                    services: r.services,
                    aboutPitch: r.description || "",
                    teamMembers: [],
                  }
                : null,
            classification:
              r.categories.length > 0 || r.skills.length > 0
                ? {
                    categories: r.categories,
                    skills: r.skills,
                    industries: r.industries,
                    markets: r.markets,
                    languages: r.languages,
                    confidence: 0.8,
                  }
                : null,
          };

          return NextResponse.json({
            found: true,
            source: "neo4j",
            data,
          });
        }
      }
    } catch (neo4jErr) {
      // Neo4j might be down — don't block enrichment
      console.warn("[Enrich/Lookup] Neo4j check failed:", neo4jErr);
    }

    console.log(`[Enrich/Lookup] Cache MISS for ${domain}`);
    return NextResponse.json({ found: false });
  } catch (error) {
    console.error("[Enrich/Lookup] Error:", error);
    return NextResponse.json({ found: false });
  }
}
