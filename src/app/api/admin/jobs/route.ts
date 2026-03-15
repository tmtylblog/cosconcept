/**
 * GET /api/admin/jobs
 *
 * Returns job queue stats from both Inngest and the legacy Postgres queue.
 * Used by the admin jobs dashboard.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { desc, sql, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { backgroundJobs } from "@/lib/db/schema";
import { jobQueueStats } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

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
    // Get aggregate stats
    const stats = await jobQueueStats();

    // Get recent jobs (last 50)
    const recentJobs = await db
      .select({
        id: backgroundJobs.id,
        type: backgroundJobs.type,
        status: backgroundJobs.status,
        createdAt: backgroundJobs.createdAt,
        startedAt: backgroundJobs.startedAt,
        completedAt: backgroundJobs.completedAt,
        attempts: backgroundJobs.attempts,
        maxAttempts: backgroundJobs.maxAttempts,
        lastError: backgroundJobs.lastError,
        payload: backgroundJobs.payload,
      })
      .from(backgroundJobs)
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(50);

    // Get per-type stats
    const typeStats = await db
      .select({
        type: backgroundJobs.type,
        status: backgroundJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(backgroundJobs)
      .groupBy(backgroundJobs.type, backgroundJobs.status);

    // Get stale jobs (pending for > 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const staleJobs = await db
      .select({
        id: backgroundJobs.id,
        type: backgroundJobs.type,
        createdAt: backgroundJobs.createdAt,
      })
      .from(backgroundJobs)
      .where(
        sql`${backgroundJobs.status} = 'pending' AND ${backgroundJobs.createdAt} < ${oneHourAgo.toISOString()}`
      );

    // Build per-type summary
    const typeSummary: Record<string, Record<string, number>> = {};
    for (const row of typeStats) {
      if (!typeSummary[row.type]) typeSummary[row.type] = {};
      typeSummary[row.type][row.status] = row.count;
    }

    // Get failed jobs (last 20)
    const failedJobs = await db
      .select({
        id: backgroundJobs.id,
        type: backgroundJobs.type,
        lastError: backgroundJobs.lastError,
        attempts: backgroundJobs.attempts,
        maxAttempts: backgroundJobs.maxAttempts,
        createdAt: backgroundJobs.createdAt,
        completedAt: backgroundJobs.completedAt,
      })
      .from(backgroundJobs)
      .where(eq(backgroundJobs.status, "failed"))
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(20);

    return NextResponse.json({
      stats,
      typeSummary,
      recentJobs,
      failedJobs,
      staleCount: staleJobs.length,
      staleJobs,
    });
  } catch (error) {
    console.error("[AdminJobs] Error:", error);
    return NextResponse.json({ error: "Failed to fetch job stats" }, { status: 500 });
  }
}
