/**
 * queue-legacy-enrichment.mjs
 *
 * Queues deep-crawl jobs for all 1044 legacy customer firms that
 * have never been through the AI enrichment pipeline.
 * Jobs are staggered 10s apart so Vercel can process them concurrently
 * without hammering Jina rate limits.
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

const sql = neon(process.env.DATABASE_URL);

// Get all legacy firms with websites that haven't been enriched yet
const firms = await sql`
  SELECT sf.id, sf.organization_id, sf.name, sf.website
  FROM service_firms sf
  WHERE sf.id LIKE 'firm_leg_%'
    AND sf.website IS NOT NULL
    AND sf.enrichment_status = 'partial'
    AND NOT EXISTS (
      SELECT 1 FROM enrichment_audit_log eal
      WHERE eal.firm_id = sf.id AND eal.phase = 'classifier'
    )
  ORDER BY sf.name
`;

console.log(`Found ${firms.length} legacy firms needing enrichment.\n`);

if (firms.length === 0) {
  console.log('Nothing to queue — all firms already enriched.');
  process.exit(0);
}

// Check for already-queued jobs to avoid duplicates
const existing = await sql`
  SELECT payload->>'firmId' as firm_id
  FROM background_jobs
  WHERE type = 'deep-crawl'
    AND status IN ('pending', 'running')
`;
const alreadyQueued = new Set(existing.map(r => r.firm_id).filter(Boolean));

const toQueue = firms.filter(f => !alreadyQueued.has(f.id));
console.log(`Already queued: ${firms.length - toQueue.length}`);
console.log(`To queue now:   ${toQueue.length}`);

const STAGGER_MS = 10_000; // 10s between jobs
const estimatedMinutes = Math.ceil((toQueue.length * STAGGER_MS) / 1000 / 60);
console.log(`Stagger: ${STAGGER_MS/1000}s → all jobs released in ~${estimatedMinutes} min`);
console.log(`(Vercel runs them concurrently — actual completion much faster)\n`);

// Insert in batches of 100
const BATCH = 100;
let queued = 0;

for (let i = 0; i < toQueue.length; i += BATCH) {
  const batch = toQueue.slice(i, i + BATCH);
  const values = batch.map((firm, idx) => {
    const delayMs = (queued + idx) * STAGGER_MS;
    const runAt = new Date(Date.now() + delayMs).toISOString();
    return {
      id: `job_crawl_${firm.id}_${Date.now() + idx}`,
      type: 'deep-crawl',
      payload: JSON.stringify({
        firmId: firm.id,
        organizationId: firm.organization_id,
        website: firm.website,
        firmName: firm.name,
      }),
      runAt,
    };
  });

  for (const v of values) {
    await sql`
      INSERT INTO background_jobs (id, type, payload, status, run_at, created_at, updated_at)
      VALUES (${v.id}, ${v.type}, ${v.payload}, 'pending', ${v.runAt}, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `;
  }

  queued += batch.length;
  process.stdout.write(`\rQueued ${queued}/${toQueue.length}...`);
}

console.log(`\n\nDone! ${queued} deep-crawl jobs queued.`);
console.log(`First job runs immediately, last job starts in ~${estimatedMinutes} min.`);
console.log(`Check progress: SELECT status, COUNT(*) FROM background_jobs WHERE type = 'deep-crawl' GROUP BY status;`);
