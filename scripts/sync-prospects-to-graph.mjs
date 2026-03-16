/**
 * Sync imported_contacts (ICP=true) as Person nodes in Neo4j with personTypes: ['prospect'].
 *
 * - Filters: isIcp=true, NOT investor_carry_over, has email
 * - Batch size: 500 per transaction
 * - ID strategy: prospect:{sourceId} to avoid collisions
 * - Creates WORKS_AT edges to Company nodes (matched by companyId → imported_companies → graph)
 *
 * Usage: node scripts/sync-prospects-to-graph.mjs
 *   --dry-run      Show counts without writing to Neo4j
 *   --limit N      Process only N contacts (for testing)
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

console.log(`=== Sync Prospects to Neo4j ${dryRun ? '(DRY RUN)' : ''} ===\n`);

// Connect to Neo4j
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

// 1. Ensure indexes exist
if (!dryRun) {
  const session = driver.session();
  try {
    console.log('Creating indexes...');
    await session.run(`CREATE INDEX prospect_email_idx IF NOT EXISTS FOR (p:Person) ON (p.email)`);
    await session.run(`CREATE INDEX prospect_id_idx IF NOT EXISTS FOR (p:Person) ON (p.id)`);
    console.log('  Indexes ready\n');
  } finally {
    await session.close();
  }
}

// 2. Count eligible contacts
const [{ count: totalEligible }] = await sql`
  SELECT count(*) as count
  FROM imported_contacts
  WHERE is_icp = true
    AND email IS NOT NULL
    AND (review_tags IS NULL OR NOT review_tags::text LIKE '%investor_carry_over%')
`;
console.log(`Eligible contacts (ICP=true, has email, not investor): ${totalEligible}`);

// 3. Company mapping done inline per batch (8.6M companies — too large to preload)
console.log('Company graph_node_id will be resolved inline per batch\n');

// 4. Stream contacts in batches
const BATCH = 500;
let offset = 0;
let totalProcessed = 0;
let totalCreated = 0;
let totalEdges = 0;

const effectiveLimit = limit || Number(totalEligible);

while (offset < effectiveLimit) {
  const batchSize = Math.min(BATCH, effectiveLimit - offset);

  const contacts = await sql`
    SELECT c.id, c.source_id, c.first_name, c.last_name, c.name, c.email, c.title,
           c.linkedin_url, c.headline, c.city, c.state, c.country, c.company_id,
           ic.graph_node_id as company_graph_node_id
    FROM imported_contacts c
    LEFT JOIN imported_companies ic ON ic.id = c.company_id
    WHERE c.is_icp = true
      AND c.email IS NOT NULL
      AND (c.review_tags IS NULL OR NOT c.review_tags::text LIKE '%investor_carry_over%')
    ORDER BY c.id
    LIMIT ${batchSize} OFFSET ${offset}
  `;

  if (contacts.length === 0) break;

  console.log(`Batch ${Math.floor(offset / BATCH) + 1}: ${contacts.length} contacts (offset ${offset})`);

  if (!dryRun) {
    // Prepare batch data for Neo4j
    const personData = contacts.map(c => ({
      id: `prospect:${c.source_id}`,
      email: c.email,
      name: c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '',
      firstName: c.first_name || '',
      lastName: c.last_name || '',
      title: c.title || '',
      linkedinUrl: c.linkedin_url || '',
      headline: c.headline || '',
      city: c.city || '',
      state: c.state || '',
      country: c.country || '',
      personTypes: ['prospect'],
      sourceId: c.source_id,
      importedContactId: c.id,
    }));

    const session = driver.session();
    try {
      // MERGE Person nodes — linkedinUrl excluded to avoid uniqueness constraint violations.
      // Contacts sharing a linkedinUrl with an existing Person are handled gracefully.
      const result = await session.run(`
        UNWIND $batch AS p
        MERGE (person:Person {id: p.id})
        ON CREATE SET
          person.email = p.email,
          person.name = p.name,
          person.firstName = p.firstName,
          person.lastName = p.lastName,
          person.title = p.title,
          person.headline = p.headline,
          person.city = p.city,
          person.state = p.state,
          person.country = p.country,
          person.personTypes = p.personTypes,
          person.sourceId = p.sourceId,
          person.importedContactId = p.importedContactId,
          person.createdAt = datetime()
        ON MATCH SET
          person.personTypes = CASE
            WHEN NOT 'prospect' IN coalesce(person.personTypes, [])
            THEN coalesce(person.personTypes, []) + ['prospect']
            ELSE person.personTypes
          END,
          person.updatedAt = datetime()
        RETURN count(person) as created
      `, { batch: personData });

      totalCreated += result.records[0].get('created').toNumber();

      // Create WORKS_AT edges for contacts with mapped companies
      const worksAtData = contacts
        .filter(c => c.company_graph_node_id)
        .map(c => ({
          personId: `prospect:${c.source_id}`,
          companyNodeId: c.company_graph_node_id,
        }));

      if (worksAtData.length > 0) {
        const edgeResult = await session.run(`
          UNWIND $batch AS rel
          MATCH (p:Person {id: rel.personId})
          MATCH (c:Company {id: rel.companyNodeId})
          MERGE (p)-[:WORKS_AT]->(c)
          RETURN count(*) as edges
        `, { batch: worksAtData });

        totalEdges += edgeResult.records[0].get('edges').toNumber();
      }
    } finally {
      await session.close();
    }
  }

  totalProcessed += contacts.length;
  offset += BATCH;

  // Progress update every 5 batches
  if (offset % (BATCH * 5) === 0) {
    console.log(`  Progress: ${totalProcessed}/${effectiveLimit} (${Math.round(totalProcessed / effectiveLimit * 100)}%)`);
  }
}

// 5. Summary
console.log(`\n=== Done! ===`);
console.log(`  Contacts processed: ${totalProcessed}`);
if (!dryRun) {
  console.log(`  Person nodes created/updated: ${totalCreated}`);
  console.log(`  WORKS_AT edges created: ${totalEdges}`);

  // Verify
  const session = driver.session();
  try {
    const [countResult] = (await session.run(
      `MATCH (p:Person) WHERE 'prospect' IN p.personTypes RETURN count(p) as cnt`
    )).records;
    console.log(`  Total prospect Person nodes in graph: ${countResult.get('cnt').toNumber()}`);
  } finally {
    await session.close();
  }
}

await driver.close();
