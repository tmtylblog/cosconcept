/**
 * run-jobs-local.ts
 *
 * Runs background jobs locally using the same handlers as production.
 * Uses .env.local for all API keys — no Vercel/cron needed.
 *
 * Usage:
 *   npx tsx scripts/run-jobs-local.ts           # run 5 jobs
 *   npx tsx scripts/run-jobs-local.ts 20        # run up to 20 jobs
 *   npx tsx scripts/run-jobs-local.ts 0         # loop until queue empty
 */

import { readFileSync } from "fs";
import { drainQueue } from "../src/lib/jobs/runner";

async function main(): Promise<void> {
  // Load .env.local before anything else touches env vars
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key?.trim() && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }

  const arg = process.argv[2];
  const maxJobs = arg === "0" ? Infinity : parseInt(arg || "5");
  const loop = maxJobs === Infinity;

  console.log(`[LocalRunner] ${loop ? "Running until queue empty" : `Running up to ${maxJobs} jobs`}...\n`);

  let totalProcessed = 0;
  let totalFailed = 0;

  if (loop) {
    while (true) {
      const result = await drainQueue(5);
      totalProcessed += result.processed ?? 0;
      totalFailed += result.failed ?? 0;

      if ((result.processed ?? 0) === 0) {
        console.log("\n[LocalRunner] Queue empty — done.");
        break;
      }

      process.stdout.write(`\r[LocalRunner] Processed: ${totalProcessed} | Failed: ${totalFailed}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  } else {
    const result = await drainQueue(maxJobs);
    totalProcessed = result.processed ?? 0;
    totalFailed = result.failed ?? 0;
  }

  console.log(`\n[LocalRunner] Done. Processed: ${totalProcessed} | Failed: ${totalFailed}`);
  process.exit(0);
}

main().catch(err => {
  console.error("[LocalRunner] Fatal error:", err);
  process.exit(1);
});
