import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serviceFirms, enrichmentCache } from "@/lib/db/schema";
import { neo4jRead } from "@/lib/neo4j";
import { like, or, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/enrich/lookup
 *
 * Check our own data (cache → PostgreSQL → Neo4j) before calling paid APIs.
 * If we've already enriched this domain, return the cached result.
 * This saves PDL credits, Jina calls, and AI classifier tokens.
 *
 * Returns:
 *   { found: true, source: "cache"|"postgres"|"neo4j", data: EnrichmentResult }
 *   { found: false }
 */
export async function POST(req: Request) {
  try {
    const { domain } = (await req.json()) as { domain: string };

    if (!domain) {
      return NextResponse.json({ found: false });
    }

    // ─── 0. Check enrichment_cache (domain-keyed, fastest) ───
    // This catches results from both guest and authenticated enrichments.
    try {
      const cacheResults = await db
        .select({
          enrichmentData: enrichmentCache.enrichmentData,
          firmName: enrichmentCache.firmName,
        })
        .from(enrichmentCache)
        .where(eq(enrichmentCache.domain, domain.toLowerCase()))
        .limit(1);

      if (cacheResults.length > 0 && cacheResults[0].enrichmentData) {
        // Increment hit count (fire-and-forget)
        db.update(enrichmentCache)
          .set({ hitCount: sql`${enrichmentCache.hitCount} + 1` })
          .where(eq(enrichmentCache.domain, domain.toLowerCase()))
          .catch(() => {});

        console.log(`[Enrich/Lookup] Cache HIT (enrichment_cache) for ${domain}: ${cacheResults[0].firmName}`);
        return NextResponse.json({
          found: true,
          source: "cache",
          data: cacheResults[0].enrichmentData,
        });
      }
    } catch (cacheErr) {
      console.warn("[Enrich/Lookup] Cache table check failed:", cacheErr);
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
        pdlSize: string | null;
        pdlRevenue: string | null;
        linkedinUrl: string | null;
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
                f.pdlSize AS pdlSize,
                f.pdlRevenue AS pdlRevenue,
                f.linkedinUrl AS linkedinUrl,
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
        // Count as a hit if we have meaningful data in any section
        // For company info, require actual PDL fields (not just a name — every node has one)
        const hasRealPdlData = !!(r.pdlIndustry || r.pdlLocation || r.employeeCount || r.pdlSize || r.pdlRevenue);
        const hasClassification = r.categories.length > 0 || r.skills.length > 0;
        const hasExtracted = r.services.length > 0 || r.clients.length > 0;
        const hasData = hasRealPdlData || hasClassification || hasExtracted;

        if (hasData) {
          console.log(`[Enrich/Lookup] Cache HIT (Neo4j) for ${domain}: ${r.name}`);

          // Helper to unwrap Neo4j integer objects (they have a .low property)
          const unwrapInt = (val: number | null): number | null => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'object') return (val as unknown as { low?: number }).low ?? null;
            return val;
          };

          // Reconstruct an EnrichmentResult-compatible shape
          // Only build companyData if we have real PDL fields (not just a name)
          const data = {
            url: r.website || `https://${domain}`,
            domain,
            logoUrl: r.logoUrl || `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`,
            success: true,
            companyCard: null,
            companyData: hasRealPdlData
              ? {
                  name: r.name,
                  industry: r.pdlIndustry || "",
                  size: r.pdlSize || "",
                  employeeCount: unwrapInt(r.employeeCount) ?? 0,
                  founded: unwrapInt(r.foundedYear),
                  location: r.pdlLocation || "",
                  tags: [],
                  inferredRevenue: r.pdlRevenue || null,
                  linkedinUrl: r.linkedinUrl || null,
                  website: r.website,
                }
              : null,
            groundTruth: null,
            pagesScraped: 0,
            evidenceCategories: [],
            extracted: hasExtracted
              ? {
                    clients: r.clients,
                    caseStudyUrls: [],
                    services: r.services,
                    aboutPitch: r.description || "",
                    teamMembers: [],
                  }
              : null,
            classification: hasClassification
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
