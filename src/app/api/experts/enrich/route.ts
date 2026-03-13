/**
 * POST /api/experts/enrich
 *
 * Customer-initiated single expert enrichment.
 * Consumes 1 enrichment credit and queues a full PDL Person Enrich job.
 *
 * Body: { expertProfileId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles, serviceFirms } from "@/lib/db/schema";
import { consumeCredit, getAvailableCredits } from "@/lib/billing/enrichment-credits";
import { enqueue } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth
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
  const { expertProfileId } = body as { expertProfileId?: string };

  if (!expertProfileId) {
    return NextResponse.json({ error: "expertProfileId is required" }, { status: 400 });
  }

  // Verify expert belongs to user's firm
  const [expert] = await db
    .select({
      id: expertProfiles.id,
      firmId: expertProfiles.firmId,
      fullName: expertProfiles.fullName,
      linkedinUrl: expertProfiles.linkedinUrl,
      enrichmentStatus: expertProfiles.enrichmentStatus,
    })
    .from(expertProfiles)
    .where(eq(expertProfiles.id, expertProfileId))
    .limit(1);

  if (!expert) {
    return NextResponse.json({ error: "Expert not found" }, { status: 404 });
  }

  // Verify firm belongs to this org
  const [firm] = await db
    .select({ id: serviceFirms.id, name: serviceFirms.name, website: serviceFirms.website })
    .from(serviceFirms)
    .where(eq(serviceFirms.organizationId, orgId))
    .limit(1);

  if (!firm || firm.id !== expert.firmId) {
    return NextResponse.json({ error: "Expert does not belong to your firm" }, { status: 403 });
  }

  // Check if already enriched
  if (expert.enrichmentStatus === "enriched") {
    return NextResponse.json({ error: "Expert is already enriched" }, { status: 409 });
  }

  // Check and consume credit
  const available = await getAvailableCredits(orgId);
  if (available <= 0) {
    return NextResponse.json(
      { error: "No enrichment credits available", upgradeRequired: true },
      { status: 402 }
    );
  }

  try {
    const { availableCredits } = await consumeCredit(orgId, expertProfileId);

    // Extract domain from firm website
    const domain = firm.website
      ? firm.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
      : undefined;

    // Queue enrichment job
    const jobId = await enqueue(
      "expert-linkedin",
      {
        expertId: expertProfileId,
        firmId: expert.firmId,
        fullName: expert.fullName,
        linkedinUrl: expert.linkedinUrl,
        companyName: firm.name,
        companyWebsite: domain,
      },
      { priority: 5 }
    );

    // Trigger worker
    const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/jobs/worker`, {
      method: "POST",
      headers: { "x-jobs-secret": (process.env.JOBS_SECRET || "").trim() },
    }).catch(() => {});

    return NextResponse.json({
      jobId,
      expertProfileId,
      availableCredits,
      message: `Enrichment queued for ${expert.fullName}`,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Insufficient enrichment credits") {
      return NextResponse.json(
        { error: "No enrichment credits available", upgradeRequired: true },
        { status: 402 }
      );
    }
    console.error("[Enrich] Error:", err);
    return NextResponse.json({ error: "Failed to queue enrichment" }, { status: 500 });
  }
}
