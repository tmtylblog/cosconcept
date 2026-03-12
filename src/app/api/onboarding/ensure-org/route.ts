import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, organizations, enrichmentCache } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

/** Follow HTTP redirects to find the canonical domain (e.g. chameleon.co → chameleoncollective.com) */
async function resolveRedirectDomain(domain: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CollectiveOS/1.0)" },
    });
    clearTimeout(timeout);
    const finalHost = new URL(res.url).hostname.replace(/^www\./, "");
    return finalHost.toLowerCase() !== domain.toLowerCase() ? finalHost.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Look up enrichment cache by domain, with redirect fallback */
async function lookupCacheByDomain(emailDomain: string): Promise<{ cached: typeof enrichmentCache.$inferSelect | null; resolvedDomain: string }> {
  // First try exact email domain
  const [direct] = await db
    .select()
    .from(enrichmentCache)
    .where(eq(enrichmentCache.domain, emailDomain))
    .limit(1);

  if (direct) return { cached: direct, resolvedDomain: emailDomain };

  // Try redirect resolution — e.g. chameleon.co → chameleoncollective.com
  const redirectDomain = await resolveRedirectDomain(emailDomain);
  if (redirectDomain) {
    const [redirected] = await db
      .select()
      .from(enrichmentCache)
      .where(eq(enrichmentCache.domain, redirectDomain))
      .limit(1);
    if (redirected) return { cached: redirected, resolvedDomain: redirectDomain };
  }

  return { cached: null, resolvedDomain: emailDomain };
}

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

    const emailDomain = session.user.email?.split("@")[1];

    // Check if serviceFirms row already exists for this org
    const [existingFirm] = await db
      .select({ id: serviceFirms.id, enrichmentData: serviceFirms.enrichmentData, website: serviceFirms.website })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, organizationId))
      .limit(1);

    if (existingFirm) {
      // If existing firm is a stub (no enrichmentData), try to hydrate it from cache
      if (!existingFirm.enrichmentData && emailDomain) {
        const { cached, resolvedDomain } = await lookupCacheByDomain(emailDomain);
        if (cached?.hasClassify) {
          const cData = (cached.enrichmentData || {}) as Record<string, unknown>;
          const classification = cData.classification as Record<string, unknown> | null;
          const extracted = cData.extracted as Record<string, unknown> | null;
          const companyData = cData.companyData as Record<string, unknown> | null;
          const websiteUrl = (cData.url as string) || `https://${resolvedDomain}`;
          const firmName = cached.firmName || (companyData?.name as string | undefined) || "Unknown Firm";
          const enrichmentData = { ...cData, url: websiteUrl, domain: resolvedDomain, logoUrl: `https://img.logo.dev/${resolvedDomain}?token=pk_anonymous&size=128&format=png`, success: true };

          await db.update(serviceFirms).set({
            name: firmName,
            website: existingFirm.website || websiteUrl,
            description: (extracted?.aboutPitch as string) || null,
            enrichmentData,
            enrichmentStatus: "enriched",
            classificationConfidence: (classification?.confidence as number) || null,
            profileCompleteness: calcCompleteness(enrichmentData),
            updatedAt: new Date(),
          }).where(eq(serviceFirms.id, existingFirm.id));

          await enqueue("firm-abstraction", { firmId: existingFirm.id, organizationId }).catch(() => {});
          console.log(`[EnsureOrg] Hydrated existing stub ${existingFirm.id} from cache for ${resolvedDomain}`);
        } else if (!existingFirm.website && emailDomain) {
          // At minimum, set the website so the offering page can trigger enrichment
          await db.update(serviceFirms).set({
            website: `https://${emailDomain}`,
            updatedAt: new Date(),
          }).where(eq(serviceFirms.id, existingFirm.id));
        }
      }
      return NextResponse.json({ firmId: existingFirm.id, created: false });
    }

    // Get org name for the firm record
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const firmId = `firm_${organizationId}`;

    // Look up enrichment cache by email domain (with redirect resolution)
    const { cached, resolvedDomain } = emailDomain
      ? await lookupCacheByDomain(emailDomain)
      : { cached: null, resolvedDomain: emailDomain ?? "" };

    if (cached?.hasClassify) {
      // Fully hydrate firm from cache — no need to wait for enrichment pipeline
      const cData = (cached.enrichmentData || {}) as Record<string, unknown>;
      const classification = cData.classification as Record<string, unknown> | null;
      const extracted = cData.extracted as Record<string, unknown> | null;
      const companyData = cData.companyData as Record<string, unknown> | null;

      const websiteUrl = (cData.url as string) || `https://${resolvedDomain}`;
      const firmName =
        cached.firmName ||
        (companyData?.name as string | undefined) ||
        org?.name ||
        "Unknown Firm";

      const enrichmentData = {
        ...cData,
        url: websiteUrl,
        domain: resolvedDomain,
        logoUrl: `https://img.logo.dev/${resolvedDomain}?token=pk_anonymous&size=128&format=png`,
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

      await enqueue("firm-abstraction", { firmId, organizationId });

      console.log(`[EnsureOrg] Created + hydrated firm ${firmId} from cache for ${resolvedDomain}`);
    } else {
      // No cache hit — create stub with website so enrichment can be triggered from UI
      await db.insert(serviceFirms).values({
        id: firmId,
        organizationId,
        name: org?.name || "Unknown Firm",
        website: emailDomain ? `https://${emailDomain}` : null,
        enrichmentStatus: "pending",
      });

      console.log(
        `[EnsureOrg] Created stub firm ${firmId} for org ${organizationId}` +
          (emailDomain ? ` (no cache for ${emailDomain})` : "")
      );
    }

    return NextResponse.json({ firmId, created: true });
  } catch (error) {
    console.error("[EnsureOrg] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
