/**
 * hydrate-firm-services.mjs
 *
 * Populates firm_services from enrichment_cache for all enriched firms
 * that have 0 services. Fixes firms that went through fix-customer-profiles
 * (which hydrated service_firms but skipped firm_services).
 *
 * Usage:
 *   node scripts/hydrate-firm-services.mjs           # dry run
 *   node scripts/hydrate-firm-services.mjs --apply   # apply
 *   node scripts/hydrate-firm-services.mjs --apply --firm=firm_xxx  # one firm
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
const firmArg = process.argv.find(a => a.startsWith('--firm='))?.split('=')[1];

if (dryRun) console.log('=== DRY RUN — pass --apply to write ===\n');

// Get enriched firms with no services
let firms;
if (firmArg) {
  firms = await sql`
    SELECT sf.id, sf.organization_id, sf.name, sf.website
    FROM service_firms sf
    WHERE sf.id = ${firmArg}
  `;
} else {
  firms = await sql`
    SELECT sf.id, sf.organization_id, sf.name, sf.website
    FROM service_firms sf
    WHERE sf.enrichment_status = 'enriched'
      AND sf.website IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM firm_services fs WHERE fs.firm_id = sf.id
      )
  `;
}

console.log(`Firms with no services: ${firms.length}`);

let totalInserted = 0;
let firmsDone = 0;

for (const firm of firms) {
  const domain = firm.website
    ?.replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .toLowerCase();

  if (!domain) continue;

  const [cache] = await sql`
    SELECT enrichment_data FROM enrichment_cache WHERE domain = ${domain} LIMIT 1
  `;

  if (!cache?.enrichment_data) {
    console.log(`[MISS] ${firm.name} (${domain}) — no cache`);
    continue;
  }

  const data = cache.enrichment_data;
  const services = data?.extracted?.services ?? [];

  if (!services.length) {
    console.log(`[SKIP] ${firm.name} (${domain}) — cache has no services`);
    continue;
  }

  console.log(`[FIX]  ${firm.name} (${domain}) — ${services.length} services`);
  services.slice(0, 5).forEach(s => console.log(`       - ${typeof s === 'string' ? s : s.name}`));
  if (services.length > 5) console.log(`       ... and ${services.length - 5} more`);

  if (!dryRun) {
    let inserted = 0;
    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      const name = typeof svc === 'string' ? svc : svc.name;
      const description = typeof svc === 'object' ? (svc.description || null) : null;
      const subServices = typeof svc === 'object' && svc.subServices?.length ? svc.subServices : null;
      if (!name) continue;

      const id = `svc_${firm.id}_${i}_${Date.now()}`;
      await sql`
        INSERT INTO firm_services (id, firm_id, organization_id, name, description, sub_services, is_hidden, display_order, created_at, updated_at)
        VALUES (${id}, ${firm.id}, ${firm.organization_id}, ${name}, ${description}, ${subServices ? JSON.stringify(subServices) : null}, false, ${i}, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `;
      inserted++;
    }
    console.log(`       ✓ Inserted ${inserted} services`);
    totalInserted += inserted;
  } else {
    totalInserted += services.length;
  }
  firmsDone++;
}

console.log(`\n=== SUMMARY ===`);
console.log(`Firms processed: ${firmsDone}`);
console.log(`${dryRun ? 'Would insert' : 'Inserted'}: ${totalInserted} services`);
if (dryRun) console.log('\nRun with --apply to execute.');
