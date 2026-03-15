/**
 * GET /api/admin/jobs
 *
 * Returns Inngest function list + backgroundJobs audit data.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { desc, sql, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { backgroundJobs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Inngest functions registered in our serve endpoint */
const INNGEST_FUNCTIONS = [
  { id: "enrich-deep-crawl", name: "Deep Website Crawl", trigger: "enrich/deep-crawl", type: "event" },
  { id: "graph-sync-firm", name: "Sync Firm to Graph", trigger: "graph/sync-firm", type: "event" },
  { id: "enrich-case-study-ingest", name: "Case Study Ingestion", trigger: "enrich/case-study-ingest", type: "event" },
  { id: "enrich-expert-linkedin", name: "Expert LinkedIn Enrichment", trigger: "enrich/expert-linkedin", type: "event" },
  { id: "enrich-team-ingest", name: "Team Roster Import", trigger: "enrich/team-ingest", type: "event" },
  { id: "enrich-firm-abstraction", name: "Firm Abstraction Profile", trigger: "enrich/firm-abstraction", type: "event" },
  { id: "enrich-firm-case-study-ingest", name: "Firm Case Study Pipeline", trigger: "enrich/firm-case-study-ingest", type: "event" },
  { id: "memory-extract", name: "Extract Conversation Memories", trigger: "memory/extract", type: "event" },
  { id: "calls-analyze", name: "Post-Call Analysis", trigger: "calls/analyze", type: "event" },
  { id: "calls-join-meeting", name: "Join Meeting (Recall.ai)", trigger: "calls/join-meeting", type: "event" },
  { id: "email-process-inbound", name: "Process Inbound Email", trigger: "email/process-inbound", type: "event" },
  { id: "email-schedule-follow-up", name: "Schedule Follow-Up", trigger: "email/schedule-follow-up", type: "event" },
  { id: "email-send-now", name: "Send Approved Email", trigger: "email/send-now", type: "event" },
  { id: "network-scan", name: "Network Relationship Scan", trigger: "network/scan", type: "event" },
  { id: "growth-attribution-check", name: "Attribution Check", trigger: "growth/attribution-check", type: "event" },
  { id: "cron-weekly-recrawl", name: "Weekly Website Recrawl", trigger: "0 2 * * 0", type: "cron" },
  { id: "cron-weekly-digest", name: "Weekly Partnership Digest", trigger: "0 8 * * 1", type: "cron" },
  { id: "cron-check-stale-partnerships", name: "Check Stale Partnerships", trigger: "0 9 * * *", type: "cron" },
  { id: "cron-linkedin-invite-scheduler", name: "LinkedIn Invite Scheduler", trigger: "0 * * * 1-6", type: "cron" },
];

export async function GET() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Recent backgroundJobs entries (audit log for status-tracked jobs like team-import)
    const recentJobs = await db
      .select({
        id: backgroundJobs.id,
        type: backgroundJobs.type,
        status: backgroundJobs.status,
        createdAt: backgroundJobs.createdAt,
        startedAt: backgroundJobs.startedAt,
        completedAt: backgroundJobs.completedAt,
        attempts: backgroundJobs.attempts,
        lastError: backgroundJobs.lastError,
      })
      .from(backgroundJobs)
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(30);

    // Count by status
    const statusCounts = await db
      .select({
        status: backgroundJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(backgroundJobs)
      .groupBy(backgroundJobs.status);

    const stats: Record<string, number> = {};
    for (const row of statusCounts) stats[row.status] = row.count;

    // Failed jobs
    const failedJobs = await db
      .select({
        id: backgroundJobs.id,
        type: backgroundJobs.type,
        lastError: backgroundJobs.lastError,
        createdAt: backgroundJobs.createdAt,
      })
      .from(backgroundJobs)
      .where(eq(backgroundJobs.status, "failed"))
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(10);

    return NextResponse.json({
      functions: INNGEST_FUNCTIONS,
      recentJobs,
      failedJobs,
      stats,
      totalJobs: Object.values(stats).reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    console.error("[AdminJobs] Error:", error);
    return NextResponse.json({ error: "Failed to fetch job stats" }, { status: 500 });
  }
}
