/**
 * Background Jobs Queue — DB operations.
 *
 * Uses Postgres as the job store (via Drizzle ORM).
 * Atomic claim uses compare-and-swap: SELECT then UPDATE WHERE status='pending',
 * so concurrent workers naturally race and only one wins.
 */

import { db } from "@/lib/db";
import { backgroundJobs } from "@/lib/db/schema";
import { and, eq, lte, lt, sql } from "drizzle-orm";

function uid(): string {
  return `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

// ─── Public types ──────────────────────────────────────

export interface ClaimedJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

// ─── Enqueue ──────────────────────────────────────────

/**
 * Add a job to the queue.
 * @param type      - Job type (maps to a registered handler)
 * @param payload   - Job-specific data passed to the handler
 * @param options.delayMs  - Delay in ms before the job can be picked up
 * @param options.priority - Higher priority = picked first (default 0)
 * @param options.maxAttempts - Max retries before marking failed (default 3)
 */
export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  options?: { delayMs?: number; priority?: number; maxAttempts?: number }
): Promise<string> {
  const id = uid();
  const runAt = options?.delayMs
    ? new Date(Date.now() + options.delayMs)
    : new Date();

  await db.insert(backgroundJobs).values({
    id,
    type,
    payload,
    priority: options?.priority ?? 0,
    runAt,
    maxAttempts: options?.maxAttempts ?? 3,
  });

  return id;
}

// ─── Claim ────────────────────────────────────────────

/**
 * Atomically claim the next pending job.
 *
 * Uses compare-and-swap: selects candidate, then UPDATE WHERE status='pending'.
 * If another worker claimed it first (0 rows updated), retries once.
 * Returns null if queue is empty or all workers raced to the same job.
 */
export async function claimNextJob(): Promise<ClaimedJob | null> {
  // Step 1: Find next eligible job
  const [candidate] = await db
    .select()
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.status, "pending"),
        lte(backgroundJobs.runAt, new Date()),
        lt(backgroundJobs.attempts, sql`${backgroundJobs.maxAttempts}`)
      )
    )
    .orderBy(
      sql`${backgroundJobs.priority} DESC`,
      backgroundJobs.runAt
    )
    .limit(1);

  if (!candidate) return null;

  // Step 2: Atomically claim it (CAS — concurrent workers will get 0 rows)
  const claimed = await db
    .update(backgroundJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      attempts: sql`${backgroundJobs.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(backgroundJobs.id, candidate.id),
        eq(backgroundJobs.status, "pending")
      )
    )
    .returning({ id: backgroundJobs.id });

  if (claimed.length === 0) {
    // Another worker got it — try to find a different job
    return claimNextJob();
  }

  return {
    id: candidate.id,
    type: candidate.type,
    payload: candidate.payload as Record<string, unknown>,
    attempts: (candidate.attempts ?? 0) + 1,
    maxAttempts: candidate.maxAttempts ?? 3,
  };
}

// ─── Complete ─────────────────────────────────────────

export async function markDone(id: string, result?: unknown): Promise<void> {
  await db
    .update(backgroundJobs)
    .set({
      status: "done",
      completedAt: new Date(),
      result: (result ?? null) as Record<string, unknown> | null,
      updatedAt: new Date(),
    })
    .where(eq(backgroundJobs.id, id));
}

export async function markFailed(
  id: string,
  error: string,
  attempts: number,
  maxAttempts: number
): Promise<void> {
  const willRetry = attempts < maxAttempts;
  // Exponential backoff: 30s → 60s → 120s
  const backoffMs = willRetry ? 30_000 * Math.pow(2, attempts - 1) : 0;

  await db
    .update(backgroundJobs)
    .set({
      status: willRetry ? "pending" : "failed",
      lastError: error.slice(0, 2000),
      // Reset startedAt so the retry isn't counted as "stuck"
      ...(willRetry ? { startedAt: null, runAt: new Date(Date.now() + backoffMs) } : {}),
      updatedAt: new Date(),
    } as Parameters<typeof db.update>[0] extends never ? never : Record<string, unknown>)
    .where(eq(backgroundJobs.id, id));
}

// ─── Maintenance ──────────────────────────────────────

/**
 * Reset jobs that have been "running" for > 10 minutes.
 * These are either timed out (Vercel killed the function) or crashed.
 * They get put back to "pending" for retry.
 */
export async function resetStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  const reset = await db
    .update(backgroundJobs)
    .set({
      status: "pending",
      startedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(backgroundJobs.status, "running"),
        lte(backgroundJobs.startedAt!, cutoff)
      )
    )
    .returning({ id: backgroundJobs.id });

  return reset.length;
}

/** Count jobs in each status — for health checks / admin UI */
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
