/**
 * Job Runner — claims and executes one pending job.
 *
 * Used by:
 *  - POST /api/jobs/worker  (Vercel Cron + after() trigger)
 *  - after() callbacks in submit routes (immediate start)
 */

import { claimNextJob, markDone, markFailed, resetStuckJobs } from "./queue";
import { getHandler } from "./registry";

/**
 * Claim and run one pending job.
 * Returns true if a job was processed, false if queue was empty.
 */
export async function runNextJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  const handler = await getHandler(job.type);
  if (!handler) {
    await markFailed(
      job.id,
      `No handler registered for job type: "${job.type}"`,
      job.attempts,
      job.maxAttempts
    );
    return false;
  }

  try {
    const result = await handler(job.payload);
    await markDone(job.id, result);
    console.log(`[Jobs] ✓ ${job.type} (${job.id}) completed`);
    return true;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[Jobs] ✗ ${job.type} (${job.id}) failed (attempt ${job.attempts}/${job.maxAttempts}):`, err);
    await markFailed(job.id, error, job.attempts, job.maxAttempts);
    return false;
  }
}

/**
 * Reset stuck jobs + run all pending jobs until queue is empty.
 * Used by cron endpoint. Runs jobs sequentially to avoid DB contention.
 * Stops after maxJobs (default 10) to stay within Vercel's maxDuration.
 */
export async function drainQueue(maxJobs = 10): Promise<{ processed: number; stuck: number }> {
  const stuck = await resetStuckJobs();
  let processed = 0;

  while (processed < maxJobs) {
    const ran = await runNextJob();
    if (!ran) break;
    processed++;
  }

  return { processed, stuck };
}
