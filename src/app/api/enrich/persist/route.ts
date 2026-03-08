import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Calculate a simple profile completeness score (0-1) */
function calculateProfileCompleteness(data: Record<string, unknown>): number {
  let score = 0;
  let total = 0;

  const check = (val: unknown) => {
    total++;
    if (val && (typeof val !== "object" || (Array.isArray(val) && val.length > 0))) {
      score++;
    }
  };

  check(data.companyData);
  check(data.groundTruth);
  const extracted = data.extracted as Record<string, unknown> | null;
  check(extracted?.clients);
  check(extracted?.services);
  check(extracted?.aboutPitch);
  check(extracted?.teamMembers);
  check(extracted?.caseStudyUrls);
  const classification = data.classification as Record<string, unknown> | null;
  check(classification?.categories);
  check(classification?.skills);
  check(classification?.industries);

  return total > 0 ? score / total : 0;
}

/**
 * POST /api/enrich/persist
 *
 * Final stage — persists combined enrichment result to database.
 * Called after PDL, Scrape, and Classify stages all complete.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      url,
      domain,
      organizationId,
      companyData,
      companyCard,
      groundTruth,
      extracted,
      classification,
      pagesScraped,
      evidenceCategories,
    } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const hasAnyData = !!(companyData || extracted || classification);

    const responseData = {
      url,
      domain,
      success: hasAnyData,
      companyCard: companyCard || null,
      companyData: companyData || null,
      groundTruth: groundTruth || null,
      pagesScraped: pagesScraped || 0,
      evidenceCategories: evidenceCategories || [],
      extracted: extracted || null,
      classification: classification || null,
    };

    const firmId = `firm_${organizationId}`;
    const firmName =
      companyData?.name ||
      (domain
        ? domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1)
        : "Unknown Firm");

    await db
      .insert(serviceFirms)
      .values({
        id: firmId,
        organizationId,
        name: firmName,
        website: url,
        description: extracted?.aboutPitch || null,
        foundedYear: companyData?.founded || null,
        enrichmentData: responseData,
        enrichmentStatus: hasAnyData ? "enriched" : "failed",
        classificationConfidence: classification?.confidence || null,
        profileCompleteness: calculateProfileCompleteness(responseData),
      })
      .onConflictDoUpdate({
        target: serviceFirms.id,
        set: {
          name: firmName,
          website: url,
          description: extracted?.aboutPitch || null,
          foundedYear: companyData?.founded || null,
          enrichmentData: responseData,
          enrichmentStatus: hasAnyData ? "enriched" : "failed",
          classificationConfidence: classification?.confidence || null,
          profileCompleteness: calculateProfileCompleteness(responseData),
          updatedAt: new Date(),
        },
      });

    console.log(`[Enrich/Persist] Saved enrichment for org ${organizationId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Enrich/Persist] Error:", error);
    return NextResponse.json(
      { error: "Failed to persist enrichment data" },
      { status: 500 }
    );
  }
}
