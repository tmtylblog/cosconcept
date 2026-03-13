/**
 * POST /api/experts/enrich-batch
 *
 * Batch enrich multiple experts at once. Consumes N credits.
 * Body: { expertProfileIds: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles, serviceFirms } from "@/lib/db/schema";
import { consumeCredit, getAvailableCredits } from "@/lib/billing/enrichment-credits";
import { enqueue } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { expertProfileIds } = body as { expertProfileIds?: string[] };

  if (!expertProfileIds?.length) {
    return NextResponse.json({ error: "expertProfileIds array is required" }, { status: 400 });
  }

  if (expertProfileIds.length > 100) {
    return NextResponse.json({ error: "Maximum 100 experts per batch" }, { status: 400 });
  }

  // Verify firm belongs to this org
  const [firm] = await db
    .select({ id: serviceFirms.id, name: serviceFirms.name, website: serviceFirms.website })
    .from(serviceFirms)
    .where(eq(serviceFirms.organizationId, orgId))
    .limit(1);

  if (!firm) {
    return NextResponse.json({ error: "No firm found for your organization" }, { status: 404 });
  }

  // Fetch all requested experts
  const experts = await db
    .select({
      id: expertProfiles.id,
      firmId: expertProfiles.firmId,
      fullName: expertProfiles.fullName,
      linkedinUrl: expertProfiles.linkedinUrl,
      enrichmentStatus: expertProfiles.enrichmentStatus,
    })
    .from(expertProfiles)
    .where(inArray(expertProfiles.id, expertProfileIds));

  // Filter to only unenriched experts belonging to this firm
  const toEnrich = experts.filter(
    (e) => e.firmId === firm.id && e.enrichmentStatus !== "enriched"
  );

  if (toEnrich.length === 0) {
    return NextResponse.json({ error: "No eligible experts to enrich" }, { status: 400 });
  }

  // Check credits
  const available = await getAvailableCredits(orgId);
  if (available < toEnrich.length) {
    return NextResponse.json(
      {
        error: `Need ${toEnrich.length} credits but only ${available} available`,
        needed: toEnrich.length,
        available,
        upgradeRequired: available === 0,
      },
      { status: 402 }
    );
  }

  // Extract domain
  const domain = firm.website
    ? firm.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    : undefined;

  // Consume credits and queue jobs
  const results: { expertId: string; jobId: string }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < toEnrich.length; i++) {
    const expert = toEnrich[i];
    try {
      await consumeCredit(orgId, expert.id);

      const jobId = await enqueue(
        "expert-linkedin",
        {
          expertId: expert.id,
          firmId: expert.firmId,
          fullName: expert.fullName,
          linkedinUrl: expert.linkedinUrl,
          companyName: firm.name,
          companyWebsite: domain,
        },
        { delayMs: i * 3000 } // stagger 3s apart
      );

      results.push({ expertId: expert.id, jobId });
    } catch (err) {
      errors.push(`${expert.fullName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Trigger worker
  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  fetch(`${baseUrl}/api/jobs/worker`, {
    method: "POST",
    headers: { "x-jobs-secret": (process.env.JOBS_SECRET || "").trim() },
  }).catch(() => {});

  const finalBalance = await getAvailableCredits(orgId);

  return NextResponse.json({
    queued: results.length,
    errors: errors.length > 0 ? errors : undefined,
    availableCredits: finalBalance,
    jobs: results,
  });
}
