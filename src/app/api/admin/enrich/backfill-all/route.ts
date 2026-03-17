/**
 * POST /api/admin/enrich/backfill-all
 *
 * Trigger Full System Enrichment or incremental backfill for all/specific firms.
 * Creates a backgroundJobs row for progress tracking, then triggers
 * the backfill-all-firms Inngest function.
 *
 * Body: {
 *   mode?: "full-system" | "incremental" (default: "incremental")
 *   dryRun?: boolean
 *   skipCompleted?: boolean (default: true, ignored in full-system mode)
 *   firmIds?: string[]
 * }
 *
 * Returns: { jobId, firmCount, estimatedSteps }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  serviceFirms,
  expertProfiles,
  firmServices,
  firmCaseStudies,
  abstractionProfiles,
  backgroundJobs,
  enrichmentAuditLog,
} from "@/lib/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const adminSecret = req.headers.get("x-admin-secret");
  if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
    return { id: "admin-cli", role: "superadmin" };
  }
  const session = await auth.api.getSession({ headers: await headers() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!session?.user || !["admin", "superadmin"].includes((session.user as any).role ?? ""))
    return null;
  return session.user;
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode: "full-system" | "incremental" = body.mode === "full-system" ? "full-system" : "incremental";
  const dryRun = body.dryRun === true;
  const skipCompleted = mode === "full-system" ? false : body.skipCompleted !== false;
  const firmIds: string[] | undefined = body.firmIds;

  // Resolve firms
  let firms;
  if (firmIds && firmIds.length > 0) {
    firms = await db
      .select({
        id: serviceFirms.id,
        name: serviceFirms.name,
        website: serviceFirms.website,
        organizationId: serviceFirms.organizationId,
        enrichmentData: serviceFirms.enrichmentData,
        enrichmentStatus: serviceFirms.enrichmentStatus,
      })
      .from(serviceFirms)
      .where(sql`${serviceFirms.id} IN ${firmIds}`);
  } else {
    firms = await db
      .select({
        id: serviceFirms.id,
        name: serviceFirms.name,
        website: serviceFirms.website,
        organizationId: serviceFirms.organizationId,
        enrichmentData: serviceFirms.enrichmentData,
        enrichmentStatus: serviceFirms.enrichmentStatus,
      })
      .from(serviceFirms);
  }

  // Calculate estimates for each firm
  const firmEstimates = [];
  for (const firm of firms) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = firm.enrichmentData as Record<string, any> | null;
    const steps: Record<string, string> = {};

    // Deep crawl (includes PDL company + crawl + classify)
    const [svcRow] = await db
      .select({ cnt: count() })
      .from(firmServices)
      .where(eq(firmServices.firmId, firm.id));
    const [csRow] = await db
      .select({ cnt: count() })
      .from(firmCaseStudies)
      .where(eq(firmCaseStudies.firmId, firm.id));
    const [classAudit] = await db
      .select({ cnt: count() })
      .from(enrichmentAuditLog)
      .where(
        and(
          eq(enrichmentAuditLog.firmId, firm.id),
          eq(enrichmentAuditLog.phase, "classifier")
        )
      );
    const hasServices = (svcRow?.cnt ?? 0) > 0;
    const hasCaseStudies = (csRow?.cnt ?? 0) > 0;
    const hasClassifier = (classAudit?.cnt ?? 0) > 0;

    if (!skipCompleted || !(hasServices && hasCaseStudies && hasClassifier)) {
      steps.deepCrawl = firm.website ? "pending" : "skip (no website)";
    } else {
      steps.deepCrawl = "skip";
    }

    // Team roster
    const [expRow] = await db
      .select({ cnt: count() })
      .from(expertProfiles)
      .where(eq(expertProfiles.firmId, firm.id));
    const expertCount = expRow?.cnt ?? 0;

    if (!skipCompleted || expertCount < 3) {
      steps.teamRoster = firm.website ? "pending" : "skip (no website)";
    } else {
      steps.teamRoster = "skip";
    }

    // Graph sync
    const [auditRow] = await db
      .select({ cnt: count() })
      .from(enrichmentAuditLog)
      .where(
        and(
          eq(enrichmentAuditLog.firmId, firm.id),
          eq(enrichmentAuditLog.phase, "deep_crawl")
        )
      );
    const hasGraph = !!ed?.graphNodeId || (auditRow?.cnt ?? 0) > 0;
    steps.graphSync = (!skipCompleted || !hasGraph) ? "pending" : "skip";

    // Skill strength (full-system only)
    steps.skillStrength = mode === "full-system" ? "pending" : "skip (incremental)";

    // Abstraction
    const [absRow] = await db
      .select({ cnt: count() })
      .from(abstractionProfiles)
      .where(
        and(
          eq(abstractionProfiles.entityType, "firm"),
          eq(abstractionProfiles.entityId, firm.id)
        )
      );
    const hasAbstraction = (absRow?.cnt ?? 0) > 0;
    steps.abstraction = (!skipCompleted || !hasAbstraction) ? "pending" : "skip";

    const pendingSteps = Object.values(steps).filter((s) => s === "pending").length;
    const skipSteps = Object.values(steps).filter((s) => s.startsWith("skip")).length;

    firmEstimates.push({
      firmId: firm.id,
      name: firm.name,
      website: firm.website,
      steps,
      pendingSteps,
      skipSteps,
      servicesCount: svcRow?.cnt ?? 0,
      caseStudiesCount: csRow?.cnt ?? 0,
      expertsCount: expertCount,
    });
  }

  const totalPending = firmEstimates.reduce((s, f) => s + f.pendingSteps, 0);
  const totalSkip = firmEstimates.reduce((s, f) => s + f.skipSteps, 0);

  // Cost estimation
  const firmsWithWebsite = firms.filter((f) => f.website).length;
  const estimatedCost = mode === "full-system"
    ? {
        note: `Full System: ~$${(firmsWithWebsite * 3).toFixed(0)} estimated (PDL company + team roster + expert enrichment via EnrichLayer/PDL + Jina + AI).`,
        breakdown: {
          companyEnrich: `${firmsWithWebsite} firms × ~$0.10 = ~$${(firmsWithWebsite * 0.1).toFixed(0)}`,
          teamRoster: `${firmsWithWebsite} firms × ~$5 avg = ~$${(firmsWithWebsite * 5).toFixed(0)}`,
          expertEnrich: `est. ~$60-170 (EnrichLayer primary, PDL fallback)`,
          caseStudies: `est. ~$10 (Jina + Gemini Flash)`,
          abstraction: `${firms.length} firms × ~$0.01 = ~$${(firms.length * 0.01).toFixed(2)}`,
        },
      }
    : {
        note: "Incremental: only pending steps cost credits. Deep-crawl ~$0.05/firm (Jina+AI). PDL: 1 credit/firm. Team: 1+ credit/firm.",
      };

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      mode,
      firmCount: firms.length,
      totalPendingSteps: totalPending,
      totalSkipSteps: totalSkip,
      estimatedCost,
      firms: firmEstimates,
    });
  }

  // Create a tracking job
  const jobId = uid("job");
  await db.insert(backgroundJobs).values({
    id: jobId,
    type: "full-system-enrichment",
    status: "pending",
    payload: { firmCount: firms.length, mode, skipCompleted, firmIds: firmIds ?? null },
    priority: 5,
  });

  // Trigger the Inngest function
  await inngest.send({
    name: "enrich/backfill-all-firms" as string,
    data: {
      firmIds: firmIds ?? null,
      skipCompleted,
      jobId,
      mode,
    },
  });

  return NextResponse.json({
    ok: true,
    jobId,
    mode,
    firmCount: firms.length,
    totalPendingSteps: totalPending,
    totalSkipSteps: totalSkip,
    message: `${mode === "full-system" ? "Full System" : "Incremental"} enrichment queued for ${firms.length} firms. Job ID: ${jobId}`,
  });
}

/** GET for polling job status */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const [job] = await db
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.id, jobId));

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    payload: job.payload,
    result: job.result,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    lastError: job.lastError,
  });
}
