import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrichmentCache } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * POST /api/enrich/cache
 *
 * Writes enrichment results to the domain-keyed cache.
 * No auth required — guests can write so future lookups (guest or auth)
 * get instant results without re-calling paid APIs (PDL, Jina, AI classify).
 *
 * This is separate from /api/enrich/persist which requires an org and writes
 * to service_firms + Neo4j. The cache is a lightweight, domain-keyed store
 * that any user benefits from.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      domain,
      companyData,
      companyCard,
      groundTruth,
      extracted,
      classification,
      pagesScraped,
      evidenceCategories,
      url,
    } = body;

    if (!domain) {
      return NextResponse.json(
        { error: "domain is required" },
        { status: 400 }
      );
    }

    // Determine what stages completed
    const cd = companyData;
    const hasPdl = !!(cd && (cd.employeeCount > 0 || cd.size || cd.location || cd.inferredRevenue));
    const hasScrape = !!(
      extracted?.services?.length ||
      extracted?.clients?.length ||
      extracted?.aboutPitch ||
      groundTruth
    );
    const hasClassify = !!(
      classification?.categories?.length &&
      classification?.skills?.length
    );

    const hasAnyData = hasPdl || hasScrape || hasClassify;
    if (!hasAnyData) {
      // Don't cache empty results
      return NextResponse.json({ success: false, reason: "no_data" });
    }

    const logoUrl = `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`;

    const firmName =
      companyData?.name ||
      domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);

    const enrichmentData = {
      url: url || `https://${domain}`,
      domain,
      logoUrl,
      success: true,
      companyCard: companyCard || null,
      companyData: companyData || null,
      groundTruth: groundTruth || null,
      pagesScraped: pagesScraped || 0,
      evidenceCategories: evidenceCategories || [],
      extracted: extracted || null,
      classification: classification || null,
    };

    await db
      .insert(enrichmentCache)
      .values({
        id: domain.toLowerCase(),
        domain: domain.toLowerCase(),
        firmName,
        enrichmentData,
        hasPdl,
        hasScrape,
        hasClassify,
        hitCount: 0,
      })
      .onConflictDoUpdate({
        target: enrichmentCache.id,
        set: {
          firmName,
          enrichmentData,
          hasPdl,
          hasScrape,
          hasClassify,
          updatedAt: new Date(),
        },
      });

    console.log(
      `[Enrich/Cache] Cached enrichment for ${domain}: PDL=${hasPdl}, Scrape=${hasScrape}, Classify=${hasClassify}`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Enrich/Cache] Error:", error);
    return NextResponse.json(
      { error: "Failed to cache enrichment data" },
      { status: 500 }
    );
  }
}
