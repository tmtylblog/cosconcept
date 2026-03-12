import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, organizations, enrichmentCache } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

function calcCompleteness(data: Record<string, unknown>): number {
  let score = 0, total = 0;
  const check = (val: unknown) => {
    total++;
    if (val && (typeof val !== "object" || (Array.isArray(val) && val.length > 0))) score++;
  };
  check(data.companyData);
  check(data.groundTruth);
  const ex = data.extracted as Record<string, unknown> | null;
  check(ex?.clients); check(ex?.services); check(ex?.aboutPitch);
  check(ex?.teamMembers); check(ex?.caseStudyUrls);
  const cl = data.classification as Record<string, unknown> | null;
  check(cl?.categories); check(cl?.skills); check(cl?.industries);
  return total > 0 ? score / total : 0;
}

/**
 * POST /api/onboarding/ensure-org
 *
 * Ensures that an authenticated user has an organization and a serviceFirms row.
 * Called automatically by the layout when a user logs in but has no activeOrg.
 *
 * If the user's email domain has a completed enrichment cache entry, the firm
 * is created fully hydrated (website, name, description, classification) rather
 * than as a bare "pending" stub.
 *
 * Takes: { organizationId } — the org ID just created/found by the client
 * Returns: { firmId, created }
 */
export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = (await req.json()) as { organizationId: string };

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organizationId" },
        { status: 400 }
      );
    }

    // Check if serviceFirms row already exists for this org
    const [existingFirm] = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, organizationId))
      .limit(1);

    if (existingFirm) {
      return NextResponse.json({
        firmId: existingFirm.id,
        created: false,
      });
    }

    // Get org name for the firm record
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const firmId = `firm_${organizationId}`;

    // Look up enrichment cache by the user's email domain
    const emailDomain = session.user.email?.split("@")[1];
    const [cached] = emailDomain
      ? await db
          .select()
          .from(enrichmentCache)
          .where(eq(enrichmentCache.domain, emailDomain))
          .limit(1)
      : [undefined];

    if (cached?.hasClassify) {
      // Fully hydrate firm from cache — no need to wait for enrichment pipeline
      const cData = (cached.enrichmentData || {}) as Record<string, unknown>;
      const classification = cData.classification as Record<string, unknown> | null;
      const extracted = cData.extracted as Record<string, unknown> | null;
      const companyData = cData.companyData as Record<string, unknown> | null;

      const websiteUrl = `https://${emailDomain}`;
      const firmName =
        cached.firmName ||
        (companyData?.name as string | undefined) ||
        org?.name ||
        "Unknown Firm";
      const logoUrl = `https://img.logo.dev/${emailDomain}?token=pk_anonymous&size=128&format=png`;

      const enrichmentData = {
        ...cData,
        url: websiteUrl,
        domain: emailDomain,
        logoUrl,
        success: true,
      };

      await db.insert(serviceFirms).values({
        id: firmId,
        organizationId,
        name: firmName,
        website: websiteUrl,
        description: (extracted?.aboutPitch as string) || null,
        enrichmentData,
        enrichmentStatus: "enriched",
        classificationConfidence: (classification?.confidence as number) || null,
        profileCompleteness: calcCompleteness(enrichmentData),
      });

      // Queue abstraction profile generation immediately
      await enqueue("firm-abstraction", { firmId, organizationId });

      console.log(
        `[EnsureOrg] Created + hydrated firm ${firmId} from cache for ${emailDomain}`
      );
    } else {
      // No cache hit — create minimal stub; enrichment pipeline will fill it in
      await db.insert(serviceFirms).values({
        id: firmId,
        organizationId,
        name: org?.name || "Unknown Firm",
        enrichmentStatus: "pending",
      });

      console.log(
        `[EnsureOrg] Created stub firm ${firmId} for org ${organizationId}` +
          (emailDomain ? ` (no cache for ${emailDomain})` : "")
      );
    }

    return NextResponse.json({
      firmId,
      created: true,
    });
  } catch (error) {
    console.error("[EnsureOrg] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
