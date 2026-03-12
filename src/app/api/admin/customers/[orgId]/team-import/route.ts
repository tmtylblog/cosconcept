/**
 * POST /api/admin/customers/[orgId]/team-import
 *
 * Triggers PDL team import for a specific org's firm.
 * Two tiers:
 * - "free": Search all → classify → auto-enrich first 5 experts
 * - "pro":  Search all → classify → auto-enrich ALL experts
 *
 * Body:
 *   tier: "free" | "pro"
 *   force?: boolean    — re-run even if recently imported
 *   limit?: number     — max people to search (default 500)
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs/queue";
import { runNextJob } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";

function extractDomain(website: string): string {
  return website
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
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

    // Queue team-ingest job
    const jobId = await enqueue(
      "team-ingest",
      {
        firmId: firm.id,
        domain,
        limit,
        autoEnrichLimit,
        force,
      },
      { priority: 5 } // Higher priority than batch jobs
    );

    // Trigger job worker immediately (runs after response is sent)
    after(runNextJob().catch(() => {}));

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
