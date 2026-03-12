/**
 * GET /api/jobs/cron
 *
 * Vercel Cron endpoint — runs every 2 minutes.
 * Resets stuck jobs + drains the pending queue.
 *
 * Also handles scheduled cron jobs (weekly-recrawl, weekly-digest, etc.)
 * by checking the current time and enqueueing them if due.
 *
 * Vercel automatically sends:
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { enqueue } from "@/lib/jobs/queue";
import { drainQueue } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  // We also accept the jobs secret for manual triggers
  const cronSecret = process.env.CRON_SECRET;
  const jobsSecret = process.env.JOBS_SECRET;

  const header = req.headers.get("authorization")?.replace(/^bearer\s+/i, "");

  if (!header) return false;
  if (cronSecret && header === cronSecret) return true;
  if (jobsSecret && header === jobsSecret) return true;
  return false;
}

/** UTC hour/minute check (±1 minute tolerance for cron drift) */
function isNearUtc(hour: number, minute = 0): boolean {
  const now = new Date();
  const nowHour = now.getUTCHours();
  const nowMinute = now.getUTCMinutes();
  const totalNow = nowHour * 60 + nowMinute;
  const targetTotal = hour * 60 + minute;
  return Math.abs(totalNow - targetTotal) <= 2;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon
  const enqueued: string[] = [];

  // ── Weekly Recrawl — every Sunday at 2:00 AM UTC ─────
  if (dayOfWeek === 0 && isNearUtc(2, 0)) {
    await enqueue("weekly-recrawl", {});
    enqueued.push("weekly-recrawl");
  }

  // ── Weekly Digest — every Monday at 8:00 AM UTC ──────
  if (dayOfWeek === 1 && isNearUtc(8, 0)) {
    await enqueue("weekly-digest", {});
    enqueued.push("weekly-digest");
  }

  // ── Stale Partnerships — every day at 9:00 AM UTC ────
  if (isNearUtc(9, 0)) {
    await enqueue("check-stale-partnerships", {});
    enqueued.push("check-stale-partnerships");
  }

  // Drain the queue (runs pending jobs, resets stuck ones)
  const result = await drainQueue(5);

  return NextResponse.json({
    ok: true,
    enqueued,
    ...result,
  });
}
