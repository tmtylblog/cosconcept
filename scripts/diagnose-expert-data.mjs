/**
 * diagnose-expert-data.mjs
 *
 * Diagnostic script to check expert_profiles data state.
 * Answers: Where is the PDL team data? Why isn't it showing on admin pages?
 *
 * Usage:
 *   node scripts/diagnose-expert-data.mjs
 *   node scripts/diagnose-expert-data.mjs --firm=firm_leg_thenetworkone_com
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length && !key.startsWith('#')) {
    process.env[key.trim()] = rest.join('=').trim();
  }
}

const sql = neon(process.env.DATABASE_URL);
const firmArg = process.argv.find(a => a.startsWith('--firm='));
const SPECIFIC_FIRM = firmArg ? firmArg.split('=')[1] : null;

console.log('=== Expert Data Diagnostic ===\n');

// 1. Total expert_profiles count
const totalExperts = await sql`SELECT COUNT(*)::int as count, COUNT(DISTINCT firm_id)::int as firms FROM expert_profiles`;
console.log(`1. EXPERT PROFILES TABLE`);
console.log(`   Total rows: ${totalExperts[0].count}`);
console.log(`   Distinct firms: ${totalExperts[0].firms}\n`);

// 2. Expert profiles by source (PDL vs enrichment_data vs manual)
const bySource = await sql`
  SELECT
    CASE
      WHEN id LIKE 'exp_pdl_%' THEN 'PDL team-ingest'
      WHEN id LIKE 'ep_%' THEN 'enrichment_data script'
      ELSE 'manual/other'
    END as source,
    COUNT(*)::int as count,
    COUNT(DISTINCT firm_id)::int as firms
  FROM expert_profiles
  GROUP BY 1
  ORDER BY count DESC
`;
console.log(`2. EXPERT PROFILES BY SOURCE`);
for (const row of bySource) {
  console.log(`   ${row.source}: ${row.count} rows, ${row.firms} firms`);
}
console.log('');

// 3. PDL classification tier distribution
const byTier = await sql`
  SELECT
    COALESCE(pdl_data->>'classifiedAs', 'unclassified') as tier,
    COUNT(*)::int as count
  FROM expert_profiles
  WHERE id LIKE 'exp_pdl_%'
  GROUP BY 1
  ORDER BY count DESC
`;
console.log(`3. PDL EXPERTS BY TIER`);
for (const row of byTier) {
  console.log(`   ${row.tier}: ${row.count}`);
}
console.log('');

// 4. Check team-ingest background jobs
const jobStats = await sql`
  SELECT status, COUNT(*)::int as count
  FROM background_jobs
  WHERE type = 'team-ingest'
  GROUP BY status
  ORDER BY count DESC
`;
console.log(`4. TEAM-INGEST JOB STATUS`);
for (const row of jobStats) {
  console.log(`   ${row.status}: ${row.count}`);
}
if (jobStats.length === 0) console.log('   (no team-ingest jobs found)');
console.log('');

// 5. Firms WITH expert_profiles vs firms WITHOUT
const firmCoverage = await sql`
  SELECT
    COUNT(DISTINCT sf.id)::int as total_firms,
    COUNT(DISTINCT ep.firm_id)::int as firms_with_experts,
    COUNT(DISTINCT sf.id)::int - COUNT(DISTINCT ep.firm_id)::int as firms_without_experts
  FROM service_firms sf
  LEFT JOIN expert_profiles ep ON ep.firm_id = sf.id
  WHERE sf.website IS NOT NULL
`;
console.log(`5. FIRM COVERAGE`);
console.log(`   Total firms with website: ${firmCoverage[0].total_firms}`);
console.log(`   Firms WITH expert_profiles: ${firmCoverage[0].firms_with_experts}`);
console.log(`   Firms WITHOUT expert_profiles: ${firmCoverage[0].firms_without_experts}\n`);

// 6. Check org linkage — firms with expert_profiles but no organization
const orgLinkage = await sql`
  SELECT
    COUNT(DISTINCT ep.firm_id)::int as firms_with_experts,
    COUNT(DISTINCT CASE WHEN sf.organization_id IS NOT NULL THEN ep.firm_id END)::int as linked_to_org,
    COUNT(DISTINCT CASE WHEN sf.organization_id IS NULL THEN ep.firm_id END)::int as no_org
  FROM expert_profiles ep
  JOIN service_firms sf ON sf.id = ep.firm_id
`;
console.log(`6. ORG LINKAGE (expert_profiles → service_firms → organizations)`);
console.log(`   Firms with experts & linked to org: ${orgLinkage[0].linked_to_org}`);
console.log(`   Firms with experts & NO org link: ${orgLinkage[0].no_org}\n`);

// 7. Check if experts are findable via admin page lookup
const adminPathCheck = await sql`
  SELECT
    COUNT(DISTINCT o.id)::int as total_orgs,
    COUNT(DISTINCT CASE WHEN ep.id IS NOT NULL THEN o.id END)::int as orgs_with_experts,
    COUNT(DISTINCT CASE WHEN ep.id IS NULL THEN o.id END)::int as orgs_without_experts
  FROM organizations o
  JOIN service_firms sf ON sf.organization_id = o.id
  LEFT JOIN expert_profiles ep ON ep.firm_id = sf.id
`;
console.log(`7. ADMIN PAGE PATH: org → service_firm → expert_profiles`);
console.log(`   Orgs total: ${adminPathCheck[0].total_orgs}`);
console.log(`   Orgs that WOULD show experts: ${adminPathCheck[0].orgs_with_experts}`);
console.log(`   Orgs that WOULD show 0 experts: ${adminPathCheck[0].orgs_without_experts}\n`);

// 8. Sample firms with most experts (top 10)
const topFirms = await sql`
  SELECT
    sf.id as firm_id,
    sf.name,
    sf.organization_id,
    COUNT(ep.id)::int as expert_count,
    COUNT(CASE WHEN ep.pdl_data->>'classifiedAs' = 'expert' THEN 1 END)::int as experts,
    COUNT(CASE WHEN ep.pdl_data->>'classifiedAs' = 'potential_expert' THEN 1 END)::int as potential,
    COUNT(CASE WHEN ep.pdl_data->>'classifiedAs' = 'not_expert' THEN 1 END)::int as not_expert
  FROM service_firms sf
  JOIN expert_profiles ep ON ep.firm_id = sf.id
  GROUP BY sf.id, sf.name, sf.organization_id
  ORDER BY expert_count DESC
  LIMIT 10
`;
console.log(`8. TOP 10 FIRMS BY EXPERT COUNT`);
for (const row of topFirms) {
  console.log(`   ${row.name} (${row.firm_id})`);
  console.log(`     org: ${row.organization_id || 'NONE'}`);
  console.log(`     total: ${row.expert_count} | expert: ${row.experts} | potential: ${row.potential} | not_expert: ${row.not_expert}`);
}
console.log('');

// 9. Specific firm check if requested
if (SPECIFIC_FIRM) {
  console.log(`9. SPECIFIC FIRM: ${SPECIFIC_FIRM}`);
  const firm = await sql`
    SELECT id, name, website, organization_id, enrichment_status
    FROM service_firms WHERE id = ${SPECIFIC_FIRM}
  `;
  if (firm.length === 0) {
    // Try as org ID
    const byOrg = await sql`
      SELECT id, name, website, organization_id, enrichment_status
      FROM service_firms WHERE organization_id = ${SPECIFIC_FIRM}
    `;
    if (byOrg.length > 0) {
      console.log(`   Found by organization_id:`);
      for (const f of byOrg) {
        console.log(`     firm_id: ${f.id}, name: ${f.name}, website: ${f.website}, enrichment: ${f.enrichment_status}`);
        const experts = await sql`SELECT COUNT(*)::int as count FROM expert_profiles WHERE firm_id = ${f.id}`;
        console.log(`     expert_profiles: ${experts[0].count}`);
      }
    } else {
      console.log(`   NOT FOUND by firm_id or organization_id`);
    }
  } else {
    const f = firm[0];
    console.log(`   name: ${f.name}, website: ${f.website}, org: ${f.organization_id}, enrichment: ${f.enrichment_status}`);
    const experts = await sql`SELECT COUNT(*)::int as count FROM expert_profiles WHERE firm_id = ${f.id}`;
    console.log(`   expert_profiles: ${experts[0].count}`);
    const jobs = await sql`
      SELECT id, status, created_at, completed_at, last_error
      FROM background_jobs
      WHERE type = 'team-ingest' AND payload->>'firmId' = ${f.id}
      ORDER BY created_at DESC LIMIT 3
    `;
    if (jobs.length > 0) {
      console.log(`   team-ingest jobs:`);
      for (const j of jobs) {
        console.log(`     ${j.id}: ${j.status} (created: ${j.created_at}, error: ${j.last_error || 'none'})`);
      }
    } else {
      console.log(`   team-ingest jobs: NONE`);
    }
  }
} else {
  console.log(`9. Pass --firm=<firmId or orgId> to check a specific firm`);
}

console.log('\n=== Diagnostic Complete ===');
