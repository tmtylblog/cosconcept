/**
 * POST /api/jobs/worker
 *
 * Claims and runs one pending background job.
 *
 * Called by:
 *   - after() callbacks in submit routes (immediate trigger on job creation)
 *   - Vercel Cron via /api/jobs/cron (every 2 minutes as safety net)
 *
 * Vercel keeps this function alive for up to maxDuration seconds,
 * giving long jobs (deep crawl, case study ingest) time to complete.
 */

import { NextRequest, NextResponse } from "next/server";
import { runNextJob, drainQueue } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — for long enrichment pipelines

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return false; // require secret to be set

  const header =
    req.headers.get("x-jobs-secret") ??
    req.headers.get("authorization")?.replace(/^bearer\s+/i, "");

  return header === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // "drain" mode: run up to N jobs (used by cron endpoint)
  const drain = req.nextUrl.searchParams.get("drain") === "true";

  try {
    if (drain) {
      const result = await drainQueue(5); // max 5 jobs per invocation
      return NextResponse.json({ ok: true, ...result });
    }

    const ran = await runNextJob();
    return NextResponse.json({ ok: true, processed: ran ? 1 : 0 });
  } catch (err) {
    console.error("[JobWorker] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Worker error" },
      { status: 500 }
    );
  }
}
