/**
 * POST /api/admin/jobs/cleanup
 *
 * Deletes stale pending jobs and optionally old completed jobs.
 * Body:
 *   stalePending?: boolean — delete pending jobs older than 1 hour (default true)
 *   oldCompleted?: boolean — delete done/failed jobs older than 7 days (default false)
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { backgroundJobs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
    const body = await req.json().catch(() => ({}));
    const { stalePending = true, oldCompleted = false } = body;

    let staleDeleted = 0;
    let oldDeleted = 0;

    if (stalePending) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const result = await db
        .delete(backgroundJobs)
        .where(
          sql`${backgroundJobs.status} = 'pending' AND ${backgroundJobs.createdAt} < ${oneHourAgo.toISOString()}`
        )
        .returning({ id: backgroundJobs.id });
      staleDeleted = result.length;
    }

    if (oldCompleted) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = await db
        .delete(backgroundJobs)
        .where(
          sql`${backgroundJobs.status} IN ('done', 'failed') AND ${backgroundJobs.createdAt} < ${sevenDaysAgo.toISOString()}`
        )
        .returning({ id: backgroundJobs.id });
      oldDeleted = result.length;
    }

    return NextResponse.json({
      staleDeleted,
      oldDeleted,
      total: staleDeleted + oldDeleted,
    });
  } catch (error) {
    console.error("[AdminJobs] Cleanup error:", error);
    return NextResponse.json({ error: "Failed to clean up jobs" }, { status: 500 });
  }
}
