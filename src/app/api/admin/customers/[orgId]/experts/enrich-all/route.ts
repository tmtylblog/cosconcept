/**
 * POST /api/admin/customers/[orgId]/experts/enrich-all
 *
 * Batch-enrich all expert-tier people who haven't been fully enriched yet.
 * Queues expert-linkedin jobs staggered 3s apart to avoid PDL rate limits.
 *
 * Cost: 1 PDL credit per expert enriched.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles, serviceFirms } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  try {
    const [firm] = await db
      .select({ id: serviceFirms.id, name: serviceFirms.name, website: serviceFirms.website })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);

    if (!firm) {
      return NextResponse.json({ error: "No firm found" }, { status: 404 });
    }

    const companyWebsite = firm.website
      ? firm.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
      : undefined;

    // Load all expert profiles for this firm
    const experts = await db
      .select()
      .from(expertProfiles)
      .where(eq(expertProfiles.firmId, firm.id));

    let queued = 0;
    let skipped = 0;

    for (const ep of experts) {
      const pdl = ep.pdlData as Record<string, unknown> | null;
      const tier = pdl?.classifiedAs as string | undefined;

      // Only enrich expert-tier (skip potential_expert and not_expert)
      if (tier !== "expert") {
        skipped++;
        continue;
      }

      // Skip if already fully enriched (has experience array)
      const hasExperience = Array.isArray(pdl?.experience) && (pdl.experience as unknown[]).length > 0;
      if (hasExperience) {
        skipped++;
        continue;
      }

      // Need either LinkedIn or enough info for PDL matching
      const fullName = ep.fullName ?? `${ep.firstName ?? ""} ${ep.lastName ?? ""}`.trim();
      if (!ep.linkedinUrl && !ep.email && !(fullName && firm.name)) {
        skipped++;
        continue;
      }

      await enqueue(
        "expert-linkedin",
        {
          expertId: ep.id,
          firmId: firm.id,
          fullName,
          linkedinUrl: ep.linkedinUrl ?? undefined,
          companyName: firm.name,
          companyWebsite,
        },
        { delayMs: queued * 3000 } // 3s stagger to avoid PDL rate limits
      );
      queued++;
    }

    // Fire-and-forget: trigger worker
    if (queued > 0) {
      const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
      fetch(`${baseUrl}/api/jobs/worker`, {
        method: "POST",
        headers: { "x-jobs-secret": (process.env.JOBS_SECRET || "").trim() },
      }).catch((err) => console.error("[EnrichAll] Failed to trigger worker:", err));
    }

    return NextResponse.json({
      queued,
      skipped,
      total: experts.length,
      estimatedCredits: queued,
      message: queued > 0
        ? `Queued ${queued} expert enrichments (${skipped} skipped). ~${queued} PDL credits.`
        : "No experts to enrich — all are already enriched or don't have enough data for PDL matching.",
    });
  } catch (error) {
    console.error("[Admin] Enrich-all error:", error);
    return NextResponse.json({ error: "Failed to trigger batch enrichment" }, { status: 500 });
  }
}
