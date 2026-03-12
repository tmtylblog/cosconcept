/**
 * Create CURRENTLY_AT edges: Person[expert] → Company:ServiceFirm
 *
 * Step 1 — isCurrentPosition=true (high confidence, ~28 expected)
 * Step 2 — Most recent open WorkHistory → ServiceFirm (medium confidence)
 * Step 3 — Log remaining gaps
 *
 * Usage:
 *   npx tsx scripts/create-currently-at-edges.ts --dry-run
 *   npx tsx scripts/create-currently-at-edges.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import neo4j, { type Driver } from "neo4j-driver";

const DRY_RUN = process.argv.includes("--dry-run");

const driver: Driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
);

async function read<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try { return (await session.run(cypher, params)).records.map(r => r.toObject() as T); }
  finally { await session.close(); }
}

async function write(cypher: string, params: Record<string, unknown> = {}): Promise<void> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try { await session.run(cypher, params); }
  finally { await session.close(); }
}

async function cnt(cypher: string): Promise<number> {
  const r = await read<{ n: any }>(cypher);
  const val = r[0]?.n;
  return typeof val === "object" && val !== null ? (val.low ?? val) : (val ?? 0);
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Create CURRENTLY_AT edges (Person → Company:ServiceFirm)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  await driver.verifyConnectivity();

  // ── Current state ──────────────────────────────────────
  console.log("── Current state ──");
  const totalPersons = await cnt("MATCH (n:Person) RETURN count(n) AS n");
  const expertPersons = await cnt("MATCH (n:Person) WHERE 'expert' IN n.personTypes RETURN count(n) AS n");
  const existingCurrentlyAt = await cnt("MATCH ()-[r:CURRENTLY_AT]->() RETURN count(r) AS n");
  const whToServiceFirm = await cnt(
    "MATCH (p:Person)-[:HAS_WORK_HISTORY]->(wh:WorkHistory)-[:WORKED_AT]->(f:Company:ServiceFirm) RETURN count(DISTINCT p) AS n"
  );
  const withCurrentFlag = await cnt(
    "MATCH (p:Person)-[:HAS_WORK_HISTORY]->(wh:WorkHistory {isCurrentPosition: true})-[:WORKED_AT]->(f:Company:ServiceFirm) RETURN count(DISTINCT p) AS n"
  );
  const openEnded = await cnt(
    "MATCH (p:Person)-[:HAS_WORK_HISTORY]->(wh:WorkHistory)-[:WORKED_AT]->(f:Company:ServiceFirm) WHERE wh.endAt IS NULL RETURN count(DISTINCT p) AS n"
  );

  console.log(`  Person total:                        ${totalPersons}`);
  console.log(`  Person[expert]:                      ${expertPersons}`);
  console.log(`  CURRENTLY_AT edges (before):         ${existingCurrentlyAt}`);
  console.log(`  Persons with WH → ServiceFirm:       ${whToServiceFirm}`);
  console.log(`    └ with isCurrentPosition=true:      ${withCurrentFlag}`);
  console.log(`    └ with open-ended WH (endAt null):  ${openEnded}`);

  // ── Preview step 1 candidates ──────────────────────────
  console.log("\n── Step 1 candidates (isCurrentPosition=true → ServiceFirm) ──");
  const step1Preview = await read<{ personName: any; firmName: any }>(
    `MATCH (p:Person)-[:HAS_WORK_HISTORY]->(wh:WorkHistory {isCurrentPosition: true})-[:WORKED_AT]->(f:Company:ServiceFirm)
     RETURN p.firstName + ' ' + p.lastName AS personName, f.name AS firmName
     ORDER BY firmName LIMIT 50`
  );
  for (const r of step1Preview) {
    console.log(`  ${r.personName} → ${r.firmName}`);
  }
  if (step1Preview.length === 0) console.log("  (none found)");

  // ── Preview step 2 candidates ──────────────────────────
  console.log("\n── Step 2 candidates (open WH → ServiceFirm, no CURRENTLY_AT yet) ──");
  const step2Count = await cnt(
    `MATCH (p:Person)-[:HAS_WORK_HISTORY]->(wh:WorkHistory)-[:WORKED_AT]->(f:Company:ServiceFirm)
     WHERE NOT EXISTS { (p)-[:CURRENTLY_AT]->() }
       AND wh.endAt IS NULL
     RETURN count(DISTINCT p) AS n`
  );
  console.log(`  Persons eligible for step 2: ${step2Count}`);

  if (DRY_RUN) {
    // ── Gap analysis ──────────────────────────────────────
    const expertsWithNoPath = await cnt(
      `MATCH (p:Person) WHERE 'expert' IN p.personTypes
       AND NOT EXISTS { (p)-[:HAS_WORK_HISTORY]->(:WorkHistory)-[:WORKED_AT]->(:Company:ServiceFirm) }
       RETURN count(p) AS n`
    );
    console.log(`\n── Gap analysis ──`);
    console.log(`  Expert persons with no WH → ServiceFirm path: ${expertsWithNoPath}`);
    console.log("  (These cannot get CURRENTLY_AT without further enrichment)");
    console.log("\n✓ Dry run complete — no changes made.");
    await driver.close();
    return;
  }

  // ── Step 1: isCurrentPosition=true ────────────────────
  console.log("\n── Step 1: Create edges from isCurrentPosition=true ──");
  await write(
    `MATCH (p:Person)-[:HAS_WORK_HISTORY]->(wh:WorkHistory {isCurrentPosition: true})-[:WORKED_AT]->(f:Company:ServiceFirm)
     MERGE (p)-[r:CURRENTLY_AT]->(f)
     SET r.source = "work_history",
         r.isPrimary = true,
         r.engagementType = "full_time",
         r.createdAt = datetime()`
  );
  const afterStep1 = await cnt("MATCH ()-[r:CURRENTLY_AT]->() RETURN count(r) AS n");
  console.log(`  ✓ CURRENTLY_AT edges after step 1: ${afterStep1}`);

  // ── Step 2: Most recent open WorkHistory ──────────────
  console.log("\n── Step 2: Create edges from most recent open WorkHistory ──");
  await write(
    `MATCH (p:Person)-[:HAS_WORK_HISTORY]->(wh:WorkHistory)-[:WORKED_AT]->(f:Company:ServiceFirm)
     WHERE NOT EXISTS { (p)-[:CURRENTLY_AT]->() }
       AND wh.endAt IS NULL
     WITH p, f, wh ORDER BY wh.startAt DESC
     WITH p, collect(f)[0] AS topFirm
     MERGE (p)-[r:CURRENTLY_AT]->(topFirm)
     SET r.source = "work_history_inferred",
         r.isPrimary = true,
         r.engagementType = "full_time",
         r.confidence = 0.7,
         r.createdAt = datetime()`
  );
  const afterStep2 = await cnt("MATCH ()-[r:CURRENTLY_AT]->() RETURN count(r) AS n");
  console.log(`  ✓ CURRENTLY_AT edges after step 2: ${afterStep2}`);

  // ── Step 3: Gap analysis ──────────────────────────────
  console.log("\n── Step 3: Gap analysis ──");
  const expertsWithNoCurrentlyAt = await cnt(
    `MATCH (p:Person) WHERE 'expert' IN p.personTypes
     AND NOT EXISTS { (p)-[:CURRENTLY_AT]->() }
     RETURN count(p) AS n`
  );
  const expertsWithNoPath = await cnt(
    `MATCH (p:Person) WHERE 'expert' IN p.personTypes
     AND NOT EXISTS { (p)-[:HAS_WORK_HISTORY]->(:WorkHistory)-[:WORKED_AT]->(:Company:ServiceFirm) }
     RETURN count(p) AS n`
  );

  console.log(`  Expert persons still without CURRENTLY_AT: ${expertsWithNoCurrentlyAt}`);
  console.log(`  Expert persons with no WH → ServiceFirm path: ${expertsWithNoPath}`);
  console.log("  (These require additional firm enrichment to resolve)");

  // ── Final state ────────────────────────────────────────
  console.log("\n── Final state ──");
  console.log(`  CURRENTLY_AT total: ${afterStep2}`);
  console.log(`    Created in step 1 (isCurrentPosition): ${afterStep1 - existingCurrentlyAt}`);
  console.log(`    Created in step 2 (inferred):          ${afterStep2 - afterStep1}`);

  await driver.close();
  console.log("\n✓ Done.");
}

main().catch(err => { console.error("Fatal:", err); driver.close(); process.exit(1); });
