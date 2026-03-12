import neo4j from 'neo4j-driver';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);
const session = driver.session();

try {
  // Node counts by label
  const nodeCount = await session.run(`
    CALL apoc.meta.stats() YIELD labels
    RETURN labels
  `).catch(() => null);

  // Fallback: manual counts per label
  const labels = ['ServiceFirm', 'Company', 'Person', 'Expert', 'Skill', 'SkillL1', 'Industry',
                  'Market', 'CaseStudy', 'Client', 'Service', 'Category', 'FirmType'];

  const counts = {};
  for (const label of labels) {
    const r = await session.run(`MATCH (n:${label}) RETURN count(n) as c`);
    const c = r.records[0]?.get('c')?.toNumber?.() ?? r.records[0]?.get('c');
    if (c > 0) counts[label] = c;
  }

  // Relationship counts
  const relTypes = ['HAS_SKILL', 'SERVES_INDUSTRY', 'IN_CATEGORY', 'WORKS_AT', 'PREFERS',
                    'PARTNER_OF', 'HAS_CASE_STUDY', 'HAS_CLIENT', 'SIMILAR_TO'];
  const relCounts = {};
  for (const rel of relTypes) {
    const r = await session.run(`MATCH ()-[r:${rel}]->() RETURN count(r) as c`);
    const c = r.records[0]?.get('c')?.toNumber?.() ?? r.records[0]?.get('c');
    if (c > 0) relCounts[rel] = c;
  }

  // Sample a few firms
  const firms = await session.run(`MATCH (f:ServiceFirm) RETURN f.name as name, f.website as website LIMIT 5`);
  const sampleFirms = firms.records.map(r => `${r.get('name')} (${r.get('website') || 'no website'})`);

  // PREFERS edges (onboarding answers → preferences)
  const prefers = await session.run(`MATCH ()-[r:PREFERS]->() RETURN count(r) as c`);
  const prefersCount = prefers.records[0]?.get('c')?.toNumber?.() ?? 0;

  console.log('=== NEO4J NODE COUNTS ===');
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\n=== RELATIONSHIP COUNTS ===');
  if (Object.keys(relCounts).length) {
    Object.entries(relCounts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  } else {
    console.log('  (none found for checked types)');
  }

  console.log('\n=== SAMPLE FIRMS ===');
  sampleFirms.forEach(f => console.log(' ', f));

  console.log('\n=== PREFERS EDGES (onboarding) ===');
  console.log('  Total PREFERS edges:', prefersCount);

} finally {
  await session.close();
  await driver.close();
}
