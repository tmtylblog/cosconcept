/**
 * import-legacy-companies.mjs
 *
 * Imports COS legacy organizations and clients into Neo4j as canonical Company nodes.
 *
 * Sources:
 *   - data/legacy/.../organization.json  → Company:ServiceFirm (isCosCustomer: true)
 *   - data/legacy/.../clients.json       → Company stubs (isCosCustomer: false)
 *
 * Unique key: domain (extracted from website field)
 * Safe to run multiple times — uses MERGE (upsert).
 */

import { readFileSync } from 'fs';
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';

config({ path: '.env.local' });

// ─── Config ──────────────────────────────────────────────────────────────────

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_URI || !NEO4J_PASSWORD) {
  console.error('Missing NEO4J_URI or NEO4J_PASSWORD in .env.local');
  process.exit(1);
}

const BATCH_SIZE = 100;

// Domains to skip — generic/social sites that are not real company websites
const DOMAIN_BLOCKLIST = new Set([
  'linkedin.com', 'twitter.com', 'facebook.com', 'instagram.com',
  'youtube.com', 'google.com', 'apple.com', 'microsoft.com',
  'github.com', 'notion.so', 'slack.com', 'zoom.us',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractDomain(url) {
  if (!url) return null;
  let d = url.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].split('#')[0];
  // Must contain a dot and not be a blocked domain
  if (!d.includes('.')) return null;
  if (DOMAIN_BLOCKLIST.has(d)) return null;
  return d;
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ─── Neo4j ───────────────────────────────────────────────────────────────────

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));

async function runWrite(query, params = {}) {
  const session = driver.session();
  try {
    await session.run(query, params);
  } finally {
    await session.close();
  }
}

// ─── Load Data ───────────────────────────────────────────────────────────────

console.log('\n[1/5] Loading JSON files...');
const orgsRaw = JSON.parse(readFileSync('./data/legacy/Data Dump (JSON)/Step 2_ Organization Basic Data/organization.json', 'utf8'));
const clientsRaw = JSON.parse(readFileSync('./data/legacy/Data Dump (JSON)/Step 3_ Organization Content Data/clients.json', 'utf8'));

const orgList = orgsRaw.data.organisation;
const clientList = clientsRaw.data.company;
console.log(`  Loaded ${orgList.length} orgs, ${clientList.length} clients`);

// ─── Process Orgs ─────────────────────────────────────────────────────────────

console.log('\n[2/5] Processing orgs → Company:ServiceFirm nodes...');

const orgNodes = [];
const orgDomainToLegacyId = new Map(); // domain → legacy org id (for WORKED_WITH edge)

let orgsSkipped = 0;

for (const org of orgList) {
  const d = org.organisation_detail;
  const domain = extractDomain(d.website);

  if (!domain) {
    orgsSkipped++;
    continue;
  }

  orgDomainToLegacyId.set(domain, org.id);

  orgNodes.push({
    domain,
    name: d.business_name || null,
    description: d.about || null,
    website: d.website ? `https://${domain}` : null,
    linkedinUrl: d.linkedinUrl || null,
    city: d.city || null,
    state: d.state || null,
    country: d.country || null,
    employeeCount: d.no_of_employees ? parseInt(d.no_of_employees) : null,
    legacyOrgId: org.id,
    isCosCustomer: true,
    enrichmentStatus: 'partial',
  });
}

console.log(`  Valid: ${orgNodes.length} | Skipped (no domain): ${orgsSkipped}`);

// ─── Process Clients ──────────────────────────────────────────────────────────

console.log('\n[3/5] Processing clients → Company stub nodes + WORKED_WITH edges...');

const clientNodes = [];          // net new companies (not already an org domain)
const workedWithEdges = [];      // { orgDomain, clientDomain }

const orgDomainSet = new Set(orgNodes.map(o => o.domain));
let clientsSkipped = 0;
let clientsIsOrg = 0;

for (const client of clientList) {
  const clientDomain = extractDomain(client.website);
  const orgDomain = extractDomain(client.organisation?.organisation_detail ?
    // org domain from the linked org — look up via legacy id
    orgNodes.find(o => o.legacyOrgId === client.organisation?.id)?.domain || null
    : null);

  // Find parent org domain by matching legacy org id
  const parentOrg = orgNodes.find(o => o.legacyOrgId === client.organisation?.id);

  if (!clientDomain) {
    clientsSkipped++;
    continue;
  }

  // Create WORKED_WITH edge if parent org exists
  if (parentOrg) {
    workedWithEdges.push({ orgDomain: parentOrg.domain, clientDomain });
  }

  // Skip adding as a new node if domain already exists as a COS org
  if (orgDomainSet.has(clientDomain)) {
    clientsIsOrg++;
    continue;
  }

  clientNodes.push({
    domain: clientDomain,
    name: client.name || null,
    website: `https://${clientDomain}`,
    employeeCount: client.noOfEmployees ? parseInt(client.noOfEmployees) : null,
    legacyClientId: client.id,
    isCosCustomer: false,
    enrichmentStatus: 'stub',
  });
}

// Dedup client nodes by domain (keep first occurrence)
const seenClientDomains = new Set();
const dedupedClientNodes = [];
for (const c of clientNodes) {
  if (!seenClientDomains.has(c.domain)) {
    seenClientDomains.add(c.domain);
    dedupedClientNodes.push(c);
  }
}

console.log(`  Valid client nodes: ${dedupedClientNodes.length}`);
console.log(`  Skipped (no domain): ${clientsSkipped}`);
console.log(`  Merged with org (same domain): ${clientsIsOrg}`);
console.log(`  WORKED_WITH edges to create: ${workedWithEdges.length}`);

// ─── Write Org Nodes ──────────────────────────────────────────────────────────

console.log('\n[4/5] Writing to Neo4j...');

// 4a. Org nodes — Company:ServiceFirm
console.log(`  Writing ${orgNodes.length} org Company nodes in batches of ${BATCH_SIZE}...`);
let orgBatch = 0;
for (const batch of chunk(orgNodes, BATCH_SIZE)) {
  await runWrite(`
    UNWIND $nodes AS n
    MERGE (c:Company {domain: n.domain})
    SET c:ServiceFirm,
        c.name = n.name,
        c.description = n.description,
        c.website = n.website,
        c.linkedinUrl = n.linkedinUrl,
        c.city = n.city,
        c.state = n.state,
        c.country = n.country,
        c.employeeCount = n.employeeCount,
        c.legacyOrgId = n.legacyOrgId,
        c.isCosCustomer = true,
        c.enrichmentStatus = 'partial',
        c.updatedAt = datetime()
  `, { nodes: batch });
  orgBatch++;
  process.stdout.write(`\r    Batch ${orgBatch}/${Math.ceil(orgNodes.length / BATCH_SIZE)} done`);
}
console.log('\n  ✓ Org nodes written');

// 4b. Client stub nodes — Company only
console.log(`  Writing ${dedupedClientNodes.length} client Company stub nodes in batches of ${BATCH_SIZE}...`);
let clientBatch = 0;
for (const batch of chunk(dedupedClientNodes, BATCH_SIZE)) {
  await runWrite(`
    UNWIND $nodes AS n
    MERGE (c:Company {domain: n.domain})
    ON CREATE SET
        c.name = n.name,
        c.website = n.website,
        c.employeeCount = n.employeeCount,
        c.legacyClientId = n.legacyClientId,
        c.isCosCustomer = false,
        c.enrichmentStatus = 'stub',
        c.createdAt = datetime(),
        c.updatedAt = datetime()
    ON MATCH SET
        c.updatedAt = datetime()
  `, { nodes: batch });
  clientBatch++;
  process.stdout.write(`\r    Batch ${clientBatch}/${Math.ceil(dedupedClientNodes.length / BATCH_SIZE)} done`);
}
console.log('\n  ✓ Client stub nodes written');

// 4c. WORKED_WITH edges (org → client)
// Dedup edges
const seenEdges = new Set();
const dedupedEdges = workedWithEdges.filter(e => {
  const key = `${e.orgDomain}→${e.clientDomain}`;
  if (seenEdges.has(key)) return false;
  seenEdges.add(key);
  return true;
});

console.log(`  Writing ${dedupedEdges.length} WORKED_WITH edges in batches of ${BATCH_SIZE}...`);
let edgeBatch = 0;
for (const batch of chunk(dedupedEdges, BATCH_SIZE)) {
  await runWrite(`
    UNWIND $edges AS e
    MATCH (org:Company {domain: e.orgDomain})
    MATCH (client:Company {domain: e.clientDomain})
    MERGE (org)-[r:WORKED_WITH]->(client)
    ON CREATE SET
        r.source = 'legacy_import',
        r.confidence = 0.9,
        r.createdAt = datetime()
  `, { edges: batch });
  edgeBatch++;
  process.stdout.write(`\r    Batch ${edgeBatch}/${Math.ceil(dedupedEdges.length / BATCH_SIZE)} done`);
}
console.log('\n  ✓ WORKED_WITH edges written');

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n[5/5] Verifying counts in Neo4j...');
const session = driver.session();
const result = await session.run(`
  MATCH (c:Company)
  RETURN
    count(c) AS total,
    sum(CASE WHEN c.isCosCustomer = true THEN 1 ELSE 0 END) AS cosCustomers,
    sum(CASE WHEN c.isCosCustomer = false THEN 1 ELSE 0 END) AS externalCompanies,
    sum(CASE WHEN c.enrichmentStatus = 'partial' THEN 1 ELSE 0 END) AS partial,
    sum(CASE WHEN c.enrichmentStatus = 'stub' THEN 1 ELSE 0 END) AS stubs
`);
await session.close();
await driver.close();

const row = result.records[0];
console.log('\n✅ Import complete!');
console.log('─────────────────────────────────');
console.log(`  Total Company nodes:    ${row.get('total')}`);
console.log(`  COS customers:          ${row.get('cosCustomers')}`);
console.log(`  External companies:     ${row.get('externalCompanies')}`);
console.log(`  Enrichment: partial:    ${row.get('partial')}`);
console.log(`  Enrichment: stubs:      ${row.get('stubs')}`);
console.log('─────────────────────────────────');
