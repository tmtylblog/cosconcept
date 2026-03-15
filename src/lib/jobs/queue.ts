/**
 * Background Jobs — DB helpers for status tracking.
 *
 * Jobs are executed by Inngest. This module provides helpers for:
 * - Reading job stats from the backgroundJobs table (admin dashboard)
 * - The backgroundJobs table is used as an audit log and for
 *   status-polling UIs (e.g. team-import progress).
 */

import { db } from "@/lib/db";
import { backgroundJobs } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

/** Count jobs in each status — for admin dashboard */
export async function jobQueueStats(): Promise<{
  pending: number;
  running: number;
  done: number;
  failed: number;
}> {
  const rows = await db
    .select({
      status: backgroundJobs.status,
      count: sql<number>`count(*)::int`,
    })
    .from(backgroundJobs)
    .groupBy(backgroundJobs.status);

  const stats = { pending: 0, running: 0, done: 0, failed: 0 };
  for (const row of rows) {
    const s = row.status as keyof typeof stats;
    if (s in stats) stats[s] = Number(row.count);
  }
  return stats;
}
