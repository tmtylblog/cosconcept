import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import { neo4jRead } from "../src/lib/neo4j";

const L1_NAMES = [
  'Administration', 'Agriculture, Horticulture, and Landscaping', 'Analysis',
  'Architecture and Construction', 'Business', 'Customer and Client Support',
  'Design', 'Economics, Policy, and Social Studies', 'Education and Training',
  'Energy and Utilities', 'Engineering', 'Environment', 'Finance',
  'Hospitality and Food Services', 'Human Resources', 'Information Technology',
  'Law, Regulation, and Compliance', 'Manufacturing and Production',
  'Marketing and Public Relations', 'Media and Communications',
  'Performing Arts, Sports, and Recreation', 'Personal Care and Services',
  'Physical and Inherent Abilities', 'Property and Real Estate', 'Sales',
  'Transportation, Supply Chain, and Logistics'
];

async function main() {
  const r = await neo4jRead<{ name: string; level: string }>(
    `MATCH (n:Skill) WHERE n.name IN $names RETURN n.name AS name, n.level AS level ORDER BY n.name`,
    { names: L1_NAMES }
  );

  const wrongLevel = r.filter(row => row.level !== 'L1');
  const found = new Set(r.map(row => row.name));
  const missing = L1_NAMES.filter(n => !found.has(n));

  console.log(`Found ${r.length}/26 L1 nodes. Wrong level: ${wrongLevel.length}. Missing: ${missing.length}`);

  if (wrongLevel.length > 0) {
    console.log("\nNodes with wrong level:");
    for (const row of wrongLevel) {
      console.log(`  ${row.name} → level=${row.level}`);
    }
  }

  if (missing.length > 0) {
    console.log("\nNot found in DB:");
    for (const name of missing) console.log(`  ${name}`);
  }

  // Also check: any L2 names that are also L1 names (overlap)?
  const l2Check = await neo4jRead<{ name: string; level: string; l1: string }>(
    `MATCH (n:Skill {level:'L2'}) WHERE n.name IN $names RETURN n.name AS name, n.level AS level, n.l1 AS l1`,
    { names: L1_NAMES }
  );
  if (l2Check.length > 0) {
    console.log("\nL1 names that currently have level='L2' (overlap):");
    for (const row of l2Check) console.log(`  ${row.name} (l1=${row.l1})`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
