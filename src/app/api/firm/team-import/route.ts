/**
 * POST /api/firm/team-import
 *
 * Firm-user-accessible endpoint to trigger team discovery.
 * Any org member can trigger this (not admin-only).
 * Auto-enriches top 5 experts after roster import.
 */

import { NextResponse, after } from "next/server";
import { headers } from "next/headers";
import { eq, and, desc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, backgroundJobs, members } from "@/lib/db/schema";
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

export async function POST(req: Request) {
  // Auth: session + verify user is member of org
  let session;
  try {
    const headersList = await headers();
    session = await auth.api.getSession({ headers: headersList });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Accept organizationId from body, fall back to session
  const body = await req.json().catch(() => ({}));
  const orgId = body.organizationId || session.session.activeOrganizationId;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  // Verify membership
  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, orgId),
        eq(members.userId, session.user.id)
      )
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
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
      return NextResponse.json({ error: "Firm has no website" }, { status: 400 });
    }

    const domain = extractDomain(firm.website);
    if (!domain) {
      return NextResponse.json({ error: "Could not extract domain" }, { status: 400 });
    }

    // Guard: check for existing recent team-ingest job (pending/running, or done within 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [existingJob] = await db
      .select({ id: backgroundJobs.id, status: backgroundJobs.status })
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.type, "team-ingest"),
          sql`${backgroundJobs.payload}->>'firmId' = ${firm.id}`,
          sql`(
            ${backgroundJobs.status} IN ('pending', 'running')
            OR (${backgroundJobs.status} = 'done' AND ${backgroundJobs.completedAt} > ${thirtyDaysAgo.toISOString()})
          )`
        )
      )
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(1);

    if (existingJob) {
      return NextResponse.json({
        alreadyRunning: true,
        jobId: existingJob.id,
        status: existingJob.status,
      });
    }

    // Queue team-ingest job with autoEnrichLimit: 5
    const jobId = await enqueue(
      "team-ingest",
      {
        firmId: firm.id,
        domain,
        limit: 500,
        autoEnrichLimit: 5,
        force: false,
      },
      { priority: 5 }
    );

    // Run the job after the response is sent (proven pattern used by calls, case-studies, etc.)
    after(runNextJob().catch(() => {}));

    return NextResponse.json({
      jobId,
      firmId: firm.id,
      domain,
    });
  } catch (error) {
    console.error("[FirmTeamImport] Error:", error);
    return NextResponse.json({ error: "Failed to trigger team import" }, { status: 500 });
  }
}
