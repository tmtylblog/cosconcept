/**
 * sync-legacy-customers.mjs
 *
 * Syncs all 1,450 isCosCustomer ServiceFirm nodes from Neo4j into Postgres
 * service_firms + organizations tables. Also deletes junk test user accounts.
 *
 * Usage:
 *   node scripts/sync-legacy-customers.mjs           # dry run
 *   node scripts/sync-legacy-customers.mjs --apply   # apply changes
 */

import { neon } from '@neondatabase/serverless';
import neo4j from 'neo4j-driver';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

const sql = neon(process.env.DATABASE_URL);
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);
const session = driver.session();

const dryRun = !process.argv.includes('--apply');
if (dryRun) console.log('=== DRY RUN — pass --apply to write changes ===\n');
else console.log('=== APPLYING CHANGES ===\n');

// ─── Junk test accounts to delete ─────────────────────────────────────────────
// Only delete accounts on clearly fake/test domains — keep real company accounts
const JUNK_DOMAINS = ['test.net', 'example.com', 'testfirm.com', 'testdomain.com'];

// ─── Step 0: Clean up orphan orgs (created by failed first run) ───────────────
console.log('=== STEP 0: ORPHAN ORG CLEANUP ===\n');
const orphanOrgs = await sql`
  SELECT o.id FROM organizations o
  WHERE NOT EXISTS (SELECT 1 FROM service_firms sf WHERE sf.organization_id = o.id)
    AND o.id LIKE 'org_leg_%'
`;
console.log(`Orphan orgs to delete: ${orphanOrgs.length}`);
if (!dryRun && orphanOrgs.length > 0) {
  const orphanIds = orphanOrgs.map(o => o.id);
  // Delete in batches to avoid query size limits
  for (let i = 0; i < orphanIds.length; i += 200) {
    const batch = orphanIds.slice(i, i + 200);
    await sql`DELETE FROM organizations WHERE id = ANY(${batch})`;
  }
  console.log(`Deleted ${orphanOrgs.length} orphan orgs.`);
}

// ─── Step 1: Delete junk test accounts ────────────────────────────────────────
console.log('\n=== STEP 1: TEST ACCOUNT CLEANUP ===\n');

const allUsers = await sql`SELECT id, email FROM users ORDER BY created_at`;
const junkUsers = allUsers.filter(u => {
  const domain = u.email.split('@')[1];
  return domain && JUNK_DOMAINS.some(d => domain.includes(d));
});
const keepUsers = allUsers.filter(u => !junkUsers.find(j => j.id === u.id));

console.log('Users to DELETE (junk domains):');
junkUsers.forEach(u => console.log(`  ✗ ${u.email}`));
console.log('\nUsers to KEEP:');
keepUsers.forEach(u => console.log(`  ✓ ${u.email}`));

if (!dryRun && junkUsers.length > 0) {
  for (const u of junkUsers) {
    // Delete cascades through members → org memberships
    await sql`DELETE FROM users WHERE id = ${u.id}`;
  }
  console.log(`\nDeleted ${junkUsers.length} junk accounts.`);
} else if (dryRun) {
  console.log(`\nWould delete ${junkUsers.length} junk accounts.`);
}

// ─── Step 2: Get existing Postgres domains to avoid duplicates ─────────────────
console.log('\n=== STEP 2: SYNC LEGACY CUSTOMERS FROM NEO4J ===\n');

const existingFirms = await sql`SELECT website, id FROM service_firms WHERE website IS NOT NULL`;
const existingByWebsite = new Map(existingFirms.map(f => [f.website?.toLowerCase(), f.id]));

const existingOrgs = await sql`SELECT id FROM organizations`;
const existingOrgIds = new Set(existingOrgs.map(o => o.id));

// ─── Step 3: Read all ServiceFirm nodes from Neo4j ─────────────────────────────
console.log('Reading Neo4j ServiceFirm nodes...');
const result = await session.run(`
  MATCH (f:ServiceFirm)
  WHERE f.isCosCustomer = true OR f.isCosCustomer IS NULL
  RETURN f.legacyId as legacyId, f.legacyOrgId as legacyOrgId,
         f.name as name, f.website as website, f.domain as domain,
         f.description as description, f.employeeCount as employeeCount,
         f.industry as industry, f.country as country, f.city as city,
         f.logoUrl as logoUrl, f.linkedinUrl as linkedinUrl,
         f.enrichmentStatus as enrichmentStatus
  ORDER BY f.name
`);

const nodes = result.records.map(r => ({
  legacyId: r.get('legacyId'),
  legacyOrgId: r.get('legacyOrgId'),
  name: r.get('name'),
  website: r.get('website'),
  domain: r.get('domain'),
  description: r.get('description'),
  employeeCount: r.get('employeeCount')?.toNumber?.() ?? r.get('employeeCount'),
  industry: r.get('industry'),
  country: r.get('country'),
  city: r.get('city'),
  logoUrl: r.get('logoUrl'),
  linkedinUrl: r.get('linkedinUrl'),
  enrichmentStatus: r.get('enrichmentStatus'),
}));

console.log(`Found ${nodes.length} ServiceFirm nodes in Neo4j.`);

// Deduplicate Neo4j nodes by website (keep first/most-complete record per URL)
const seenWebsites = new Map();
for (const n of nodes) {
  if (!n.website) continue;
  const key = n.website.toLowerCase();
  if (!seenWebsites.has(key)) {
    seenWebsites.set(key, n);
  } else {
    // Keep the one with more data
    const existing = seenWebsites.get(key);
    const score = (n) => [n.description, n.industry, n.employeeCount, n.logoUrl].filter(Boolean).length;
    if (score(n) > score(existing)) seenWebsites.set(key, n);
  }
}
const deduped = [...seenWebsites.values()];
const duplicatesRemoved = nodes.length - deduped.length;
if (duplicatesRemoved > 0) console.log(`Deduped ${duplicatesRemoved} duplicate website entries.`);

// Filter to ones not already in Postgres
const toCreate = deduped.filter(n => !existingByWebsite.has(n.website.toLowerCase()));
const alreadyExist = deduped.length - toCreate.length;

console.log(`Already in Postgres: ${alreadyExist}`);
console.log(`To create: ${toCreate.length}`);

if (dryRun) {
  console.log('\nSample of what would be created:');
  toCreate.slice(0, 10).forEach(n =>
    console.log(`  ${n.name} | ${n.website} | ${n.industry || 'no industry'}`)
  );
  if (toCreate.length > 10) console.log(`  ... and ${toCreate.length - 10} more`);
} else {
  // ─── Step 4: Insert in batches of 50 ──────────────────────────────────────────
  let created = 0, errors = 0;
  const BATCH = 50;

  // Track used slugs to handle duplicates
  const usedSlugs = new Set(
    (await sql`SELECT slug FROM organizations`).map(o => o.slug)
  );

  function makeSlug(name, domain) {
    // Prefer domain-based slug (stable, unique)
    if (domain) {
      const base = domain.replace(/\./g, '-').toLowerCase().slice(0, 60);
      if (!usedSlugs.has(base)) { usedSlugs.add(base); return base; }
    }
    // Fall back to name-based slug
    let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    let slug = base, i = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${i++}`;
    usedSlugs.add(slug);
    return slug;
  }

  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH);
    process.stdout.write(`  Inserting batch ${Math.floor(i/BATCH)+1}/${Math.ceil(toCreate.length/BATCH)}...`);

    for (const node of batch) {
      try {
        // Generate stable IDs — use legacyId if present, else fall back to domain
        const idSuffix = node.legacyId || `dom_${(node.domain || node.website).replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
        const orgId = node.legacyOrgId || `org_leg_${idSuffix}`;
        const firmId = `firm_leg_${idSuffix}`;
        const slug = makeSlug(node.name, node.domain);

        // Create org (skip if already exists — could have been created by a prior run)
        if (!existingOrgIds.has(orgId)) {
          await sql`
            INSERT INTO organizations (id, name, slug, created_at)
            VALUES (${orgId}, ${node.name}, ${slug}, NOW())
            ON CONFLICT (id) DO NOTHING
          `;
          existingOrgIds.add(orgId);
        }

        // Build enrichment data payload
        const enrichmentData = {
          url: node.website,
          domain: node.domain,
          logoUrl: node.logoUrl,
          success: true,
          companyData: {
            name: node.name,
            industry: node.industry,
            employeeCount: node.employeeCount,
            location: node.city ? `${node.city}, ${node.country || ''}`.trim() : null,
          },
          legacyImport: true,
        };

        // Create service_firm
        await sql`
          INSERT INTO service_firms (
            id, organization_id, name, website, description,
            enrichment_data, enrichment_status,
            is_cos_customer, cos_customer_since,
            is_platform_member, entity_type,
            created_at, updated_at
          ) VALUES (
            ${firmId}, ${orgId}, ${node.name}, ${node.website},
            ${node.description || null},
            ${JSON.stringify(enrichmentData)},
            ${node.enrichmentStatus || 'partial'},
            true, NOW(),
            true, 'service_firm',
            NOW(), NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `;

        // Write firmId + organizationId back to Neo4j node
        await session.run(`
          MATCH (f:ServiceFirm {legacyId: $legacyId})
          SET f.firmId = $firmId, f.organizationId = $orgId
        `, { legacyId: node.legacyId, firmId, orgId });

        created++;
      } catch (err) {
        errors++;
        console.error(`\n  ERROR: ${node.name} (${node.website}): ${err.message}`);
      }
    }
    console.log(` done (${created} created so far)`);
  }

  console.log(`\n✓ Created ${created} firms in Postgres`);
  if (errors > 0) console.log(`✗ ${errors} errors`);

  // Update Neo4j: make sure all nodes are explicitly marked isCosCustomer
  console.log('\nMarking all ServiceFirm nodes as isCosCustomer=true in Neo4j...');
  await session.run(`MATCH (f:ServiceFirm) WHERE f.isCosCustomer IS NULL SET f.isCosCustomer = true`);
  console.log('Done.');
}

// ─── Summary ───────────────────────────────────────────────────────────────────
console.log('\n=== SUMMARY ===');
console.log(`Neo4j ServiceFirm nodes: ${nodes.length}`);
console.log(`Already in Postgres:     ${alreadyExist}`);
console.log(`${dryRun ? 'Would create' : 'Created'}:             ${toCreate.length}`);
console.log(`Test accounts ${dryRun ? 'to delete' : 'deleted'}:  ${junkUsers.length}`);

if (dryRun) console.log('\nRun with --apply to execute.');

await session.close();
await driver.close();
