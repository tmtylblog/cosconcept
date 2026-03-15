/**
 * POST /api/admin/customers/[orgId]/team-import
 *
 * Triggers PDL team import for a specific org's firm.
 * Two tiers:
 * - "free": Search all -> classify -> auto-enrich first 5 experts
 * - "pro":  Search all -> classify -> auto-enrich ALL experts
 *
 * Body:
 *   tier: "free" | "pro"
 *   force?: boolean    -- re-run even if recently imported
 *   limit?: number     -- max people to search (default 500)
 *
 * Sends an Inngest event -- job runs durably in background.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, backgroundJobs } from "@/lib/db/schema";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

function extractDomain(website: string): string {
  return website
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
}

function uid(): string {
  return `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export async function POST(
  req: NextRequest,
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
    const body = await req.json().catch(() => ({}));
    const {
      tier = "free",
      force = false,
      limit = 500,
    } = body as { tier?: "free" | "pro"; force?: boolean; limit?: number };

    // Find firm
    const [firm] = await db
      .select({
        id: serviceFirms.id,
        website: serviceFirms.website,
        name: serviceFirms.name,
      })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);

    if (!firm) {
      return NextResponse.json({ error: "No firm found for this org" }, { status: 404 });
    }

    if (!firm.website) {
      return NextResponse.json({ error: "Firm has no website — need domain for PDL search" }, { status: 400 });
    }

    const domain = extractDomain(firm.website);
    if (!domain) {
      return NextResponse.json({ error: "Could not extract domain from website" }, { status: 400 });
    }

    // Set auto-enrich limit based on tier
    const autoEnrichLimit = tier === "pro" ? -1 : 5; // -1 = all experts

    // Create tracking row in backgroundJobs for the status endpoint
    const jobId = uid();
    await db.insert(backgroundJobs).values({
      id: jobId,
      type: "team-ingest",
      payload: { firmId: firm.id, domain, limit, autoEnrichLimit, force },
      priority: 5,
      status: "pending",
    });

    // Send Inngest event — job runs durably in background
    await inngest.send({
      name: "enrich/team-ingest",
      data: {
        firmId: firm.id,
        domain,
        limit,
        autoEnrichLimit,
        force,
        jobId,
        companyName: firm.name ?? undefined,
      },
    });

    return NextResponse.json({
      jobId,
      firmId: firm.id,
      firmName: firm.name,
      domain,
      tier,
      autoEnrichLimit,
      searchLimit: limit,
      message: `Team import queued for ${firm.name} (${domain}). ${tier === "pro" ? "All experts" : "First 5 experts"} will be auto-enriched.`,
    });
  } catch (error) {
    console.error("[Admin] Team import trigger error:", error);
    return NextResponse.json({ error: "Failed to trigger team import" }, { status: 500 });
  }
}
