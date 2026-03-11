import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
config({ path: '.env.local' });

const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD));
const session = driver.session();

const queries = [
  ['Total Company nodes', 'MATCH (c:Company) RETURN count(c) AS n'],
  ['Company WITH domain', 'MATCH (c:Company) WHERE c.domain IS NOT NULL RETURN count(c) AS n'],
  ['Company WITHOUT domain', 'MATCH (c:Company) WHERE c.domain IS NULL RETURN count(c) AS n'],
  ['isCosCustomer=true', 'MATCH (c:Company {isCosCustomer: true}) RETURN count(c) AS n'],
  ['isCosCustomer=false', 'MATCH (c:Company {isCosCustomer: false}) RETURN count(c) AS n'],
  ['isCosCustomer=null', 'MATCH (c:Company) WHERE c.isCosCustomer IS NULL RETURN count(c) AS n'],
  ['enrichmentStatus=partial', "MATCH (c:Company {enrichmentStatus: 'partial'}) RETURN count(c) AS n"],
  ['enrichmentStatus=stub', "MATCH (c:Company {enrichmentStatus: 'stub'}) RETURN count(c) AS n"],
  ['enrichmentStatus=null', 'MATCH (c:Company) WHERE c.enrichmentStatus IS NULL RETURN count(c) AS n'],
  ['Company:ServiceFirm', 'MATCH (c:Company:ServiceFirm) RETURN count(c) AS n'],
  ['WORKED_WITH edges', 'MATCH ()-[r:WORKED_WITH]->() RETURN count(r) AS n'],
  ['Sample no-domain Company', 'MATCH (c:Company) WHERE c.domain IS NULL RETURN labels(c) AS labels, keys(c) AS props LIMIT 3'],
];

console.log('\n=== Neo4j Company Import Verification ===\n');
for (const [label, query] of queries) {
  const r = await session.run(query);
  const val = r.records[0]?.get('n') ?? r.records.map(rec => ({ labels: rec.get('labels'), props: rec.get('props') }));
  console.log(`  ${label.padEnd(35)} ${JSON.stringify(typeof val === 'object' && val?.low !== undefined ? val.low : val)}`);
}

await session.close();
await driver.close();
