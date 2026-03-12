/**
 * One-time script: hydrate customer service_firms from enrichment_cache.
 * Equivalent to POST /api/admin/enrich/fix-customer-profiles but runs
 * directly against the DB — no HTTP auth needed.
 *
 * Usage:
 *   node scripts/fix-customer-profiles.mjs           # dry run
 *   node scripts/fix-customer-profiles.mjs --apply   # apply changes
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

if (dryRun) console.log('=== DRY RUN — pass --apply to write changes ===\n');
else console.log('=== APPLYING CHANGES ===\n');

// Only skip genuinely fake/junk domains — NOT real company domains with test@ emails
const SKIP_DOMAINS = ['test.net', 'example.com', 'testfirm.com'];

function calcCompleteness(data) {
  let score = 0, total = 0;
  const check = (val) => {
    total++;
    if (val && (typeof val !== 'object' || (Array.isArray(val) && val.length > 0))) score++;
  };
  check(data.companyData); check(data.groundTruth);
  const ex = data.extracted || {};
  check(ex.clients); check(ex.services); check(ex.aboutPitch);
  check(ex.teamMembers); check(ex.caseStudyUrls);
  const cl = data.classification || {};
  check(cl.categories); check(cl.skills); check(cl.industries);
  return total > 0 ? score / total : 0;
}

// Get all customers: user → member(owner) → org → service_firm
const customers = await sql`
  SELECT
    u.email,
    sf.id as firm_id,
    sf.name as firm_name,
    sf.organization_id,
    sf.enrichment_status
  FROM users u
  JOIN members m ON m.user_id = u.id AND m.role = 'owner'
  JOIN organizations o ON o.id = m.organization_id
  JOIN service_firms sf ON sf.organization_id = o.id
  ORDER BY u.created_at DESC
`;

// Load all enrichment cache
const cache = await sql`SELECT domain, firm_name, has_classify, enrichment_data FROM enrichment_cache`;
const cacheByDomain = Object.fromEntries(cache.map(c => [c.domain, c]));

const results = { total: customers.length, fixed: 0, alreadyEnriched: 0, noCache: 0, skipped: 0, errors: [] };

for (const customer of customers) {
  const domain = customer.email?.split('@')[1];

  // Skip only genuinely junk domains — real company domains are valid even with test@ prefix
  const isTest = !domain || SKIP_DOMAINS.some(s => domain.includes(s));

  if (isTest) {
    results.skipped++;
    console.log(`[SKIP]  ${customer.email} — test account`);
    continue;
  }

  if (customer.enrichment_status === 'enriched') {
    results.alreadyEnriched++;
    console.log(`[SKIP]  ${customer.email} — already enriched`);
    continue;
  }

  const cached = cacheByDomain[domain];
  if (!cached?.has_classify) {
    results.noCache++;
    console.log(`[MISS]  ${customer.email} — no classified cache for ${domain}`);
    continue;
  }

  const cData = cached.enrichment_data || {};
  const classification = cData.classification || {};
  const extracted = cData.extracted || {};
  const companyData = cData.companyData || {};

  const websiteUrl = `https://${domain}`;
  const firmName = cached.firm_name || companyData.name || customer.firm_name || 'Unknown Firm';
  const logoUrl = `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`;

  const enrichmentData = { ...cData, url: websiteUrl, domain, logoUrl, success: true };
  const completeness = calcCompleteness(enrichmentData);

  console.log(`[FIX]   ${customer.email}`);
  console.log(`        "${customer.firm_name}" → "${firmName}" | ${domain}`);
  console.log(`        categories: ${classification.categories?.join(', ') || 'none'}`);
  console.log(`        skills: ${classification.skills?.slice(0, 5).join(', ') || 'none'}`);
  console.log(`        confidence: ${classification.confidence ?? 'n/a'} | completeness: ${(completeness * 100).toFixed(0)}%`);

  if (!dryRun) {
    try {
      await sql`
        UPDATE service_firms SET
          name = ${firmName},
          website = ${websiteUrl},
          description = ${extracted.aboutPitch || null},
          enrichment_data = ${JSON.stringify(enrichmentData)},
          enrichment_status = 'enriched',
          classification_confidence = ${classification.confidence || null},
          profile_completeness = ${completeness},
          updated_at = NOW()
        WHERE id = ${customer.firm_id}
      `;
      console.log(`        ✓ Updated DB`);

      // Queue firm-abstraction job (staggered 10s apart per firm)
      const delayMs = results.fixed * 10000;
      const runAt = new Date(Date.now() + delayMs).toISOString();
      await sql`
        INSERT INTO background_jobs (id, type, payload, status, run_at, created_at, updated_at)
        VALUES (
          ${'job_abs_' + customer.firm_id + '_' + Date.now()},
          'firm-abstraction',
          ${JSON.stringify({ firmId: customer.firm_id, organizationId: customer.organization_id })},
          'pending',
          ${runAt},
          NOW(),
          NOW()
        )
        ON CONFLICT DO NOTHING
      `;
      console.log(`        ✓ Queued firm-abstraction (delay: ${delayMs / 1000}s)`);

      results.fixed++;
    } catch (err) {
      results.errors.push(`${customer.email}: ${err.message}`);
      console.log(`        ✗ ERROR: ${err.message}`);
    }
  } else {
    results.fixed++;
  }

  console.log();
}

console.log('=== SUMMARY ===');
console.log(`Total customers:       ${results.total}`);
console.log(`${dryRun ? 'Would fix' : 'Fixed'}:              ${results.fixed}`);
console.log(`Already enriched:      ${results.alreadyEnriched}`);
console.log(`No cache:              ${results.noCache}`);
console.log(`Skipped (test):        ${results.skipped}`);
if (results.errors.length) {
  console.log(`Errors:                ${results.errors.length}`);
  results.errors.forEach(e => console.log(`  - ${e}`));
}

if (dryRun && results.fixed > 0) {
  console.log(`\nRun with --apply to execute these changes.`);
}
