/**
 * Patches existing Company nodes that were created before isCosCustomer/enrichmentStatus
 * properties existed. Sets sensible defaults based on label.
 */
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
config({ path: '.env.local' });

const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD));
const session = driver.session();

console.log('Patching Company nodes with missing properties...\n');

// 1. ServiceFirm nodes without isCosCustomer → true (they are COS customers)
const r1 = await session.run(`
  MATCH (c:Company:ServiceFirm)
  WHERE c.isCosCustomer IS NULL
  SET c.isCosCustomer = true,
      c.enrichmentStatus = CASE WHEN c.enrichmentStatus IS NULL THEN 'partial' ELSE c.enrichmentStatus END
  RETURN count(c) AS patched
`);
console.log(`ServiceFirm → isCosCustomer=true:    ${r1.records[0].get('patched')}`);

// 2. Non-ServiceFirm Company nodes without isCosCustomer → false (external companies)
const r2 = await session.run(`
  MATCH (c:Company)
  WHERE c.isCosCustomer IS NULL AND NOT c:ServiceFirm
  SET c.isCosCustomer = false,
      c.enrichmentStatus = CASE WHEN c.enrichmentStatus IS NULL THEN 'stub' ELSE c.enrichmentStatus END
  RETURN count(c) AS patched
`);
console.log(`External Company → isCosCustomer=false: ${r2.records[0].get('patched')}`);

// 3. Final verification
const r3 = await session.run(`
  MATCH (c:Company)
  RETURN
    count(c) AS total,
    sum(CASE WHEN c.isCosCustomer = true THEN 1 ELSE 0 END) AS cosCustomers,
    sum(CASE WHEN c.isCosCustomer = false THEN 1 ELSE 0 END) AS externalCompanies,
    sum(CASE WHEN c.isCosCustomer IS NULL THEN 1 ELSE 0 END) AS nullCustomer,
    sum(CASE WHEN c.enrichmentStatus = 'partial' THEN 1 ELSE 0 END) AS partial,
    sum(CASE WHEN c.enrichmentStatus = 'stub' THEN 1 ELSE 0 END) AS stubs,
    sum(CASE WHEN c.enrichmentStatus IS NULL THEN 1 ELSE 0 END) AS nullStatus
`);

const row = r3.records[0];
console.log('\n✅ Final state:');
console.log('─────────────────────────────────────────');
console.log(`  Total Company nodes:       ${row.get('total')}`);
console.log(`  COS customers (true):      ${row.get('cosCustomers')}`);
console.log(`  External companies (false): ${row.get('externalCompanies')}`);
console.log(`  Still null:                ${row.get('nullCustomer')}`);
console.log(`  enrichmentStatus=partial:  ${row.get('partial')}`);
console.log(`  enrichmentStatus=stub:     ${row.get('stubs')}`);
console.log(`  Still null status:         ${row.get('nullStatus')}`);
console.log('─────────────────────────────────────────');

await session.close();
await driver.close();
