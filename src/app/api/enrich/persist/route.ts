import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, firmCaseStudies, firmServices } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { writeFirmToGraph } from "@/lib/enrichment/graph-writer";
import { enqueue } from "@/lib/jobs/queue";
import { runNextJob } from "@/lib/jobs/runner";

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

    const logoUrl = domain ? `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png` : null;

    const responseData = {
      url,
      domain,
      logoUrl,
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

    // Determine entity type from classification firmNature
    const firmNature = classification?.firmNature as string | undefined;
    const isBrand = firmNature === "brand_or_retailer" || firmNature === "product_company";
    const entityType = isBrand ? "potential_client" : "service_firm";

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
        entityType,
        ...(isBrand
          ? {
              registeredInterestEmail: session.user.email ?? null,
              registeredInterestAt: new Date(),
            }
          : {}),
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
          entityType,
          ...(isBrand
            ? {
                registeredInterestEmail: session.user.email ?? null,
                registeredInterestAt: new Date(),
              }
            : {}),
          updatedAt: new Date(),
        },
      });

    console.log(`[Enrich/Persist] Saved enrichment for org ${organizationId} (entityType: ${entityType})`);

    // ─── Auto-seed firmServices from discovered services ────
    // Only seed if no firmServices rows exist yet for this firm (first-time enrichment)
    const discoveredServices = (extracted?.services as string[] | undefined) ?? [];
    if (discoveredServices.length > 0 && !isBrand) {
      const [existingService] = await db
        .select({ id: firmServices.id })
        .from(firmServices)
        .where(eq(firmServices.firmId, firmId))
        .limit(1);

      if (!existingService) {
        const now = new Date();
        await db.insert(firmServices).values(
          discoveredServices.map((name, i) => ({
            id: `svc_${Date.now().toString(36)}_${i.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            firmId,
            organizationId,
            name: name.trim(),
            description: null,
            sourceUrl: url || null,
            sourcePageTitle: domain ? `${domain} — auto-discovered` : "Auto-discovered",
            subServices: [] as string[],
            isHidden: false,
            displayOrder: i,
            createdAt: now,
            updatedAt: now,
          }))
        ).onConflictDoNothing();
        console.log(`[Enrich/Persist] Seeded ${discoveredServices.length} services for firm ${firmId}`);
      }
    }

    // ─── Auto-queue case study ingestion for discovered URLs ─
    const discoveredCsUrls = (extracted?.caseStudyUrls as string[] | undefined) ?? [];
    if (discoveredCsUrls.length > 0 && !isBrand) {
      let queued = 0;
      for (const csUrl of discoveredCsUrls.slice(0, 30)) { // cap at 30 to avoid flooding
        try {
          // Skip if already exists
          const [existing] = await db
            .select({ id: firmCaseStudies.id })
            .from(firmCaseStudies)
            .where(
              and(
                eq(firmCaseStudies.firmId, firmId),
                eq(firmCaseStudies.sourceUrl, csUrl)
              )
            )
            .limit(1);
          if (existing) continue;

          const csId = `cs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
          await db.insert(firmCaseStudies).values({
            id: csId,
            firmId,
            organizationId,
            sourceUrl: csUrl,
            sourceType: "url",
            status: "pending",
          });
          await enqueue("firm-case-study-ingest", {
            caseStudyId: csId,
            firmId,
            organizationId,
            sourceUrl: csUrl,
            sourceType: "url",
          });
          queued++;
        } catch (err) {
          console.warn(`[Enrich/Persist] Failed to queue case study ${csUrl}:`, err);
        }
      }
      if (queued > 0) {
        after(runNextJob().catch(() => {}));
        console.log(`[Enrich/Persist] Queued ${queued} case studies for ingestion (firm ${firmId})`);
      }
    }

    // ─── Write to Neo4j Knowledge Graph (best-effort) ───
    try {
      const graphResult = await writeFirmToGraph({
        firmId,
        organizationId,
        name: firmName,
        website: url,
        logoUrl: domain ? `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png` : undefined,
        description: extracted?.aboutPitch || null,
        foundedYear: companyData?.founded || null,
        employeeCount: companyData?.employeeCount || null,
        pdl: companyData
          ? {
              ...companyData,
              displayName: companyData.name || firmName,
              headline: "",
              summary: "",
              website: url,
              employeeCountByCountry: {},
              linkedinSlug: null,
              facebookUrl: null,
              twitterUrl: null,
              totalFundingRaised: null,
              latestFundingStage: null,
              lastFundingDate: null,
              numberOfFundingRounds: null,
              type: null,
              likelihood: 0,
              id: firmId,
              location: companyData.location
                ? { name: companyData.location, locality: "", region: "", country: "", continent: "" }
                : null,
            }
          : null,
        groundTruth: extracted
          ? {
              homepage: { url: url || "", title: "", content: "", scrapedAt: new Date().toISOString() },
              evidence: [],
              extracted: {
                clients: extracted.clients || [],
                caseStudyUrls: extracted.caseStudyUrls || [],
                services: extracted.services || [],
                aboutPitch: extracted.aboutPitch || "",
                teamMembers: extracted.teamMembers || [],
              },
              rawContent: "",
              pageTitles: [],
            }
          : null,
        classification: classification || null,
      });
      console.log(
        `[Enrich/Persist] Graph write: ${graphResult.categories} categories, ` +
        `${graphResult.skills} skills, ${graphResult.clients} clients, ` +
        `${graphResult.services} services` +
        (graphResult.errors.length ? ` (${graphResult.errors.length} errors)` : "")
      );
    } catch (graphErr) {
      console.warn("[Enrich/Persist] Graph write failed (non-blocking):", graphErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Enrich/Persist] Error:", error);
    return NextResponse.json(
      { error: "Failed to persist enrichment data" },
      { status: 500 }
    );
  }
}
