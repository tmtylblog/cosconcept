/**
 * GET /api/firm/team-import/status
 *
 * Firm-user-accessible status endpoint for team discovery.
 * Returns phase, search results, and enrichment progress.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, and, desc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, backgroundJobs, expertProfiles, members } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — allow time if status check overlaps with long job

export async function GET(req: Request) {
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

  // Accept organizationId from query param, fall back to session
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("organizationId") || session.session.activeOrganizationId;
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
      .select({ id: serviceFirms.id, website: serviceFirms.website })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);

    if (!firm) {
      return NextResponse.json({ phase: "idle", searchResults: null, enrichProgress: null, domain: null });
    }

    const domain = firm.website
      ? firm.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase()
      : null;

    // Find most recent team-ingest job for this firm
    const [teamJob] = await db
      .select()
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.type, "team-ingest"),
          sql`${backgroundJobs.payload}->>'firmId' = ${firm.id}`
        )
      )
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(1);

    if (!teamJob) {
      // Check for batch-discovered experts (from pdl-team-discovery script)
      const discoveredExperts = await db
        .select({
          id: expertProfiles.id,
          pdlData: expertProfiles.pdlData,
          pdlEnrichedAt: expertProfiles.pdlEnrichedAt,
        })
        .from(expertProfiles)
        .where(eq(expertProfiles.firmId, firm.id));

      let dExperts = 0, dPotential = 0, dNotExperts = 0, dEnriched = 0;
      for (const ep of discoveredExperts) {
        const pdl = ep.pdlData as Record<string, unknown> | null;
        const tier = pdl?.classifiedAs as string | undefined;
        if (tier === "expert") dExperts++;
        else if (tier === "potential_expert") dPotential++;
        else if (tier === "not_expert") dNotExperts++;
        // skip unclassified
        const hasExp = Array.isArray(pdl?.experience) && (pdl.experience as unknown[]).length > 0;
        if (hasExp) dEnriched++;
      }

      if (dExperts + dPotential + dNotExperts > 0) {
        return NextResponse.json({
          phase: "discovered",
          domain,
          searchResults: {
            total: discoveredExperts.length,
            experts: dExperts,
            potentialExperts: dPotential,
            notExperts: dNotExperts,
          },
          enrichProgress: {
            total: dExperts + dPotential,
            completed: dEnriched,
            running: 0,
            failed: 0,
          },
        });
      }

      return NextResponse.json({ phase: "idle", searchResults: null, enrichProgress: null, domain });
    }

    // Determine phase from job status
    let phase: string;
    if (teamJob.status === "pending") {
      phase = "queued";
    } else if (teamJob.status === "running") {
      phase = "searching";
    } else if (teamJob.status === "done") {
      phase = "done";
    } else if (teamJob.status === "failed") {
      phase = "error";
    } else {
      phase = teamJob.status;
    }

    // Get expert tier counts
    const experts = await db
      .select({
        id: expertProfiles.id,
        pdlData: expertProfiles.pdlData,
      })
      .from(expertProfiles)
      .where(eq(expertProfiles.firmId, firm.id));

    let expertCount = 0, potentialCount = 0, notExpertCount = 0;
    for (const ep of experts) {
      const pdl = ep.pdlData as Record<string, unknown> | null;
      const tier = pdl?.classifiedAs as string | undefined;
      if (tier === "expert") expertCount++;
      else if (tier === "potential_expert") potentialCount++;
      else if (tier === "not_expert") notExpertCount++;
    }

    // Get enrichment progress
    let enrichTotal = 0, enrichCompleted = 0, enrichRunning = 0, enrichFailed = 0;
    if (experts.length > 0) {
      const enrichJobs = await db
        .select({
          status: backgroundJobs.status,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(backgroundJobs)
        .where(
          and(
            eq(backgroundJobs.type, "expert-linkedin"),
            sql`${backgroundJobs.payload}->>'firmId' = ${firm.id}`
          )
        )
        .groupBy(backgroundJobs.status);

      for (const row of enrichJobs) {
        const c = row.count;
        enrichTotal += c;
        if (row.status === "done") enrichCompleted += c;
        else if (row.status === "running") enrichRunning += c;
        else if (row.status === "failed") enrichFailed += c;
      }
    }

    // If team-ingest is done but enrichment jobs are still running, phase = "enriching"
    if (phase === "done" && enrichRunning > 0) {
      phase = "enriching";
    }

    // Extract pdlTotal from job result (set by worker after PDL search)
    const jobResult = teamJob.result as Record<string, unknown> | null;
    const pdlTotal = (jobResult?.pdlTotal as number) ?? null;

    return NextResponse.json({
      phase,
      domain,
      jobError: teamJob.lastError,
      searchResults: {
        total: experts.length,
        pdlTotal,
        experts: expertCount,
        potentialExperts: potentialCount,
        notExperts: notExpertCount,
      },
      enrichProgress: {
        total: enrichTotal,
        completed: enrichCompleted,
        running: enrichRunning,
        failed: enrichFailed,
      },
    });
  } catch (error) {
    console.error("[FirmTeamImport] Status error:", error);
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 });
  }
}
