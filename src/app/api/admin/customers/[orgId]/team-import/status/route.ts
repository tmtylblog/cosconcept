/**
 * GET /api/admin/customers/[orgId]/team-import/status
 *
 * Returns the current status of a team import job:
 * - phase: idle | searching | classifying | enriching | done | error
 * - searchResults: { total, experts, potentialExperts, notExperts }
 * - enrichProgress: { total, completed, running, failed }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, and, desc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, backgroundJobs, expertProfiles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
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
    // Find firm
    const [firm] = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);

    if (!firm) {
      return NextResponse.json({ error: "No firm found" }, { status: 404 });
    }

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
      // Check if we have batch-discovered experts (from pdl-team-discovery script)
      const discoveredExperts = await db
        .select({
          id: expertProfiles.id,
          pdlData: expertProfiles.pdlData,
          pdlEnrichedAt: expertProfiles.pdlEnrichedAt,
        })
        .from(expertProfiles)
        .where(eq(expertProfiles.firmId, firm.id));

      // Count experts with PDL classification data
      let dExperts = 0, dPotential = 0, dNotExperts = 0, dUnclassified = 0;
      let dEnriched = 0;
      for (const ep of discoveredExperts) {
        const pdl = ep.pdlData as Record<string, unknown> | null;
        const tier = pdl?.classifiedAs as string | undefined;
        if (tier === "expert") dExperts++;
        else if (tier === "potential_expert") dPotential++;
        else if (tier === "not_expert") dNotExperts++;
        else dUnclassified++;
        // Fully enriched = has experience array
        const hasExp = Array.isArray(pdl?.experience) && (pdl.experience as unknown[]).length > 0;
        if (hasExp) dEnriched++;
      }

      const hasClassifiedExperts = dExperts + dPotential + dNotExperts > 0;

      if (hasClassifiedExperts) {
        const enrichable = dExperts + dPotential;
        return NextResponse.json({
          phase: "discovered",
          searchResults: {
            total: discoveredExperts.length,
            experts: dExperts,
            potentialExperts: dPotential,
            notExperts: dNotExperts,
            unclassified: dUnclassified,
          },
          enrichProgress: {
            total: enrichable,
            completed: dEnriched,
            running: 0,
            failed: 0,
          },
        });
      }

      return NextResponse.json({
        phase: "idle",
        searchResults: null,
        enrichProgress: null,
      });
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

    // Get expert tier counts from expert_profiles
    const experts = await db
      .select({
        id: expertProfiles.id,
        pdlData: expertProfiles.pdlData,
        pdlEnrichedAt: expertProfiles.pdlEnrichedAt,
      })
      .from(expertProfiles)
      .where(eq(expertProfiles.firmId, firm.id));

    let expertCount = 0;
    let potentialCount = 0;
    let notExpertCount = 0;
    let unclassified = 0;

    for (const ep of experts) {
      const pdl = ep.pdlData as Record<string, unknown> | null;
      const tier = pdl?.classifiedAs as string | undefined;
      if (tier === "expert") expertCount++;
      else if (tier === "potential_expert") potentialCount++;
      else if (tier === "not_expert") notExpertCount++;
      else unclassified++;
    }

    // Get enrichment progress — count expert-linkedin jobs for this firm's experts
    const expertIds = experts.map((e) => e.id);
    let enrichTotal = 0;
    let enrichCompleted = 0;
    let enrichRunning = 0;
    let enrichFailed = 0;

    if (expertIds.length > 0) {
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

    return NextResponse.json({
      phase,
      jobId: teamJob.id,
      jobStatus: teamJob.status,
      jobError: teamJob.lastError,
      jobResult: teamJob.result,
      startedAt: teamJob.startedAt,
      completedAt: teamJob.completedAt,
      searchResults: {
        total: experts.length,
        experts: expertCount,
        potentialExperts: potentialCount,
        notExperts: notExpertCount,
        unclassified,
      },
      enrichProgress: {
        total: enrichTotal,
        completed: enrichCompleted,
        running: enrichRunning,
        failed: enrichFailed,
      },
    });
  } catch (error) {
    console.error("[Admin] Team import status error:", error);
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 });
  }
}
