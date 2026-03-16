/**
 * Enrich Company stub nodes in Neo4j with data from imported_companies.
 *
 * Matches by domain — updates industry, size, employee count, location,
 * description, and other firmographic data.
 *
 * Usage: node scripts/enrich-client-stubs.mjs
 *   --dry-run   Show counts without writing to Neo4j
 *   --limit N   Process only N stubs
 */
import { readFileSync } from 'fs';
import neo4j from 'neo4j-driver';
import { neon } from '@neondatabase/serverless';

// Load env
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)/);
  if (match) {
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[match[1].trim()] = val;
  }
}

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');
const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : null;

console.log(`=== Enrich Client Stubs ${dryRun ? '(DRY RUN)' : ''} ===\n`);

// Connect to Neo4j
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

// 1. Get all Company stubs from Neo4j that have a domain
const session = driver.session();
let stubs;
try {
  const result = await session.run(`
    MATCH (c:Company)
    WHERE c.domain IS NOT NULL
      AND (c.enrichmentStatus IS NULL OR c.enrichmentStatus IN ["stub", "prospect"])
      AND c.isCosCustomer <> true
    RETURN c.domain AS domain, c.name AS name
    ${limit ? `LIMIT ${limit}` : ''}
  `);
  stubs = result.records.map(r => ({
    domain: r.get('domain'),
    name: r.get('name'),
  }));
} finally {
  await session.close();
}

console.log(`Found ${stubs.length} Company stubs with domains to enrich\n`);

// 2. Batch lookup in imported_companies
const BATCH = 200;
let totalEnriched = 0;

for (let i = 0; i < stubs.length; i += BATCH) {
  const batch = stubs.slice(i, i + BATCH);
  const domains = batch.map(s => s.domain);

  // Query PG for matching companies
  const rows = await sql`
    SELECT domain, name, industry, sector, sub_industry,
           size, employee_count_exact, employee_range,
           city, state, country, country_code,
           description, company_type, founded_year,
           revenue, estimated_revenue, latest_funding_stage
    FROM imported_companies
    WHERE domain = ANY(${domains})
  `;

  if (rows.length === 0) continue;

  // Build lookup map
  const byDomain = new Map(rows.map(r => [r.domain, r]));

  // 3. Update Neo4j nodes
  const updates = batch
    .filter(s => byDomain.has(s.domain))
    .map(s => {
      const r = byDomain.get(s.domain);
      return {
        domain: s.domain,
        industry: r.industry || r.sector || null,
        subIndustry: r.sub_industry || null,
        size: r.size || r.employee_range || null,
        employeeCount: r.employee_count_exact || null,
        city: r.city || null,
        state: r.state || null,
        country: r.country || null,
        countryCode: r.country_code || null,
        description: r.description?.slice(0, 500) || null,
        companyType: r.company_type || null,
        foundedYear: r.founded_year || null,
        revenue: r.revenue || r.estimated_revenue || null,
        fundingStage: r.latest_funding_stage || null,
      };
    });

  if (updates.length > 0 && !dryRun) {
    const writeSession = driver.session();
    try {
      await writeSession.run(`
        UNWIND $updates AS u
        MATCH (c:Company {domain: u.domain})
        SET c.industry = coalesce(u.industry, c.industry),
            c.subIndustry = coalesce(u.subIndustry, c.subIndustry),
            c.size = coalesce(u.size, c.size),
            c.employeeCount = coalesce(u.employeeCount, c.employeeCount),
            c.city = coalesce(u.city, c.city),
            c.state = coalesce(u.state, c.state),
            c.country = coalesce(u.country, c.country),
            c.countryCode = coalesce(u.countryCode, c.countryCode),
            c.description = coalesce(u.description, c.description),
            c.companyType = coalesce(u.companyType, c.companyType),
            c.foundedYear = coalesce(u.foundedYear, c.foundedYear),
            c.revenue = coalesce(u.revenue, c.revenue),
            c.fundingStage = coalesce(u.fundingStage, c.fundingStage),
            c.enrichmentStatus = "researched",
            c.updatedAt = datetime()
      `, { updates });
      totalEnriched += updates.length;
    } finally {
      await writeSession.close();
    }
  } else {
    totalEnriched += updates.length;
  }

  if ((i + BATCH) % 1000 === 0 || i + BATCH >= stubs.length) {
    console.log(`  Progress: ${Math.min(i + BATCH, stubs.length)}/${stubs.length} checked, ${totalEnriched} enriched`);
  }
}

// 4. Summary
console.log(`\n=== Done! ===`);
console.log(`  Stubs checked: ${stubs.length}`);
console.log(`  Enriched with PG data: ${totalEnriched}`);

if (!dryRun) {
  const verifySession = driver.session();
  try {
    const [result] = (await verifySession.run(
      `MATCH (c:Company) WHERE c.enrichmentStatus = "researched" RETURN count(c) as cnt`
    )).records;
    console.log(`  Total "researched" Company nodes: ${result.get('cnt').toNumber()}`);
  } finally {
    await verifySession.close();
  }
}

await driver.close();
