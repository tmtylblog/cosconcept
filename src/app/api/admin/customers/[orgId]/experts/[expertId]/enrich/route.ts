/**
 * POST /api/admin/customers/[orgId]/experts/[expertId]/enrich
 *
 * Triggers PDL enrichment for a single expert.
 * Used for the manual "Enrich" button on potential/not-expert experts.
 * Requires the expert to have a linkedinUrl.
 * Costs 1 PDL credit.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles, serviceFirms } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs/queue";
import { runNextJob } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; expertId: string }> }
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

  const { orgId, expertId } = await params;

  try {
    // Verify firm belongs to this org
    const [firm] = await db
      .select({ id: serviceFirms.id, name: serviceFirms.name, website: serviceFirms.website })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);

    if (!firm) {
      return NextResponse.json({ error: "No firm found" }, { status: 404 });
    }

    // Load expert profile
    const [expert] = await db
      .select()
      .from(expertProfiles)
      .where(
        and(
          eq(expertProfiles.id, expertId),
          eq(expertProfiles.firmId, firm.id)
        )
      )
      .limit(1);

    if (!expert) {
      return NextResponse.json({ error: "Expert not found in this firm" }, { status: 404 });
    }

    // Check if already fully enriched
    if (expert.pdlEnrichedAt) {
      const pdlData = expert.pdlData as Record<string, unknown> | null;
      const hasExperience = Array.isArray(pdlData?.experience) && (pdlData.experience as unknown[]).length > 0;
      if (hasExperience) {
        return NextResponse.json({
          error: "Expert is already fully enriched",
          enrichedAt: expert.pdlEnrichedAt,
        }, { status: 400 });
      }
    }

    // Need either linkedinUrl or enough info for PDL to match
    if (!expert.linkedinUrl && !expert.email && !(expert.fullName && firm.name)) {
      return NextResponse.json({
        error: "Expert needs a LinkedIn URL, email, or full name + company to enrich",
      }, { status: 400 });
    }

    // Extract company domain for PDL matching
    const companyWebsite = firm.website
      ? firm.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
      : undefined;

    // Queue expert-linkedin job
    const jobId = await enqueue(
      "expert-linkedin",
      {
        expertId: expert.id,
        firmId: firm.id,
        fullName: expert.fullName ?? `${expert.firstName ?? ""} ${expert.lastName ?? ""}`.trim(),
        linkedinUrl: expert.linkedinUrl ?? undefined,
        companyName: firm.name,
        companyWebsite,
      },
      { priority: 10 } // High priority for manual enrichment
    );

    // Trigger job worker immediately (runs after response is sent)
    after(runNextJob().catch(() => {}));

    return NextResponse.json({
      jobId,
      expertId: expert.id,
      fullName: expert.fullName,
      message: `Enrichment queued for ${expert.fullName ?? expertId}`,
    });
  } catch (error) {
    console.error("[Admin] Expert enrich error:", error);
    return NextResponse.json({ error: "Failed to trigger enrichment" }, { status: 500 });
  }
}
