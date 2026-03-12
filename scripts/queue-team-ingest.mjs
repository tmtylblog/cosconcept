/**
 * queue-team-ingest.mjs
 *
 * Queue PDL team roster ingestion jobs for customer firms.
 *
 * Cost warning: 1 PDL credit per person returned.
 * With 1,300 credits and limit=5: can process ~260 firms.
 *
 * Usage:
 *   node scripts/queue-team-ingest.mjs                    # dry run, limit=5, all enriched firms
 *   node scripts/queue-team-ingest.mjs --apply            # queue all enriched firms, limit=5
 *   node scripts/queue-team-ingest.mjs --apply --limit=50 # full roster (costs more!)
 *   node scripts/queue-team-ingest.mjs --apply --firm=firm_leg_acme_com  # single firm
 *   node scripts/queue-team-ingest.mjs --apply --max=50  # cap at 50 firms total
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

const sql = neon(process.env.DATABASE_URL);

const dryRun = !process.argv.includes('--apply');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const firmArg = process.argv.find(a => a.startsWith('--firm='));
const maxArg = process.argv.find(a => a.startsWith('--max='));

const PEOPLE_LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 5;
const SPECIFIC_FIRM = firmArg ? firmArg.split('=')[1] : null;
const MAX_FIRMS = maxArg ? parseInt(maxArg.split('=')[1]) : Infinity;

if (dryRun) console.log('=== DRY RUN — pass --apply to queue jobs ===\n');
else console.log('=== APPLYING CHANGES ===\n');

console.log(`People per firm: ${PEOPLE_LIMIT} (estimated cost: ${PEOPLE_LIMIT} credits/firm)`);
if (SPECIFIC_FIRM) console.log(`Target firm: ${SPECIFIC_FIRM}`);
if (MAX_FIRMS !== Infinity) console.log(`Firm cap: ${MAX_FIRMS}`);

// Get firms to process
let firms;
if (SPECIFIC_FIRM) {
  firms = await sql`
    SELECT id, website FROM service_firms
    WHERE id = ${SPECIFIC_FIRM} AND website IS NOT NULL
  `;
} else {
  firms = await sql`
    SELECT sf.id, sf.website
    FROM service_firms sf
    WHERE sf.website IS NOT NULL
      AND NOT EXISTS (
        -- Skip firms with a recent team-ingest audit entry
        SELECT 1 FROM enrichment_audit_log eal
        WHERE eal.firm_id = sf.id
          AND eal.phase = 'team-ingest'
          AND eal.created_at > NOW() - INTERVAL '30 days'
      )
    ORDER BY sf.name
  `;
}

// Check for already-queued jobs
const existing = await sql`
  SELECT payload->>'firmId' as firm_id
  FROM background_jobs
  WHERE type = 'team-ingest'
    AND status IN ('pending', 'running')
`;
const alreadyQueued = new Set(existing.map(r => r.firm_id).filter(Boolean));

const toQueue = firms
  .filter(f => !alreadyQueued.has(f.id))
  .slice(0, MAX_FIRMS);

console.log(`\nFirms with websites:     ${firms.length}`);
console.log(`Already queued:          ${firms.length - toQueue.length}`);
console.log(`To queue now:            ${toQueue.length}`);
console.log(`Estimated PDL credits:   ${toQueue.length * PEOPLE_LIMIT}`);

if (dryRun) {
  console.log('\nSample firms:');
  toQueue.slice(0, 10).forEach(f => {
    const domain = f.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    console.log(`  ${f.id} | ${domain}`);
  });
  if (toQueue.length > 10) console.log(`  ... and ${toQueue.length - 10} more`);
  console.log('\nRun with --apply to queue these jobs.');
  process.exit(0);
}

if (toQueue.length === 0) {
  console.log('Nothing to queue.');
  process.exit(0);
}

// Confirm cost before proceeding
const estimatedCredits = toQueue.length * PEOPLE_LIMIT;
if (estimatedCredits > 100) {
  console.log(`\n⚠  This will use approximately ${estimatedCredits} PDL credits.`);
  if (!process.argv.includes('--yes')) {
    console.log('Add --yes to confirm, or use --max=N to limit firms processed.');
    process.exit(1);
  }
}

// Insert jobs with 5-second stagger
const STAGGER_MS = 5_000;
let queued = 0;

function extractDomain(website) {
  return website
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .toLowerCase();
}

for (let i = 0; i < toQueue.length; i++) {
  const firm = toQueue[i];
  const domain = extractDomain(firm.website);
  if (!domain) continue;

  const delayMs = i * STAGGER_MS;
  const runAt = new Date(Date.now() + delayMs).toISOString();
  const jobId = `job_team_${firm.id}_${Date.now() + i}`;

  await sql`
    INSERT INTO background_jobs (id, type, payload, status, run_at, created_at, updated_at)
    VALUES (
      ${jobId},
      'team-ingest',
      ${JSON.stringify({ firmId: firm.id, domain, limit: PEOPLE_LIMIT })},
      'pending',
      ${runAt},
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING
  `;

  queued++;
  if (i % 50 === 0 || i === toQueue.length - 1) {
    process.stdout.write(`\rQueued ${queued}/${toQueue.length}...`);
  }
}

const estimatedMinutes = Math.ceil((toQueue.length * STAGGER_MS) / 60_000);
console.log(`\n\n✓ Done! ${queued} team-ingest jobs queued.`);
console.log(`  People per firm: ${PEOPLE_LIMIT}`);
console.log(`  Total PDL credits: ~${queued * PEOPLE_LIMIT}`);
console.log(`  Jobs staggered 5s apart → all released in ~${estimatedMinutes} min`);
console.log(`\nMonitor: SELECT status, COUNT(*) FROM background_jobs WHERE type = 'team-ingest' GROUP BY status;`);
