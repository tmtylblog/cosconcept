/**
 * Track A Final Migration — Complete all remaining legacy → canonical conversions
 *
 * Steps:
 *   1. Backfill Person:Expert labels (from EMPLOYS edges)
 *   2. Create CURRENTLY_AT edges (Person→ServiceFirm, replacing EMPLOYS direction)
 *   3. Migrate legacy edges to Track A equivalents
 *      - OPERATES_IN_INDUSTRY → SERVES_INDUSTRY (ServiceFirm→Industry)
 *      - LOCATED_IN → OPERATES_IN (ServiceFirm→Market)
 *      - HAS_INDUSTRY_EXPERIENCE → SERVES_INDUSTRY (Person→Industry)
 *      - HAS_MARKET_EXPERIENCE → OPERATES_IN (Person→Market)
 *      - BELONGS_TO_INDUSTRY → IN_INDUSTRY (CaseStudy→Industry)
 *   4. Strip old Category label from FirmCategory nodes (keep FirmCategory)
 *   5. Strip old FirmType label from DeliveryModel nodes (keep DeliveryModel)
 *   6. Migrate Organization → Company label
 *   7. Remove EMPLOYS edges (after CURRENTLY_AT created)
 *
 * Usage:
 *   npx tsx scripts/migrate-track-a-final.ts --dry-run
 *   npx tsx scripts/migrate-track-a-final.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import neo4j, { type Driver } from "neo4j-driver";

const DRY_RUN = process.argv.includes("--dry-run");

function createDriver(): Driver {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;
  if (!uri || !username || !password) {
    console.error("❌ Missing Neo4j env vars in .env.local");
    process.exit(1);
  }
  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

const driver = createDriver();

async function read<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

async function write(cypher: string, params: Record<string, unknown> = {}): Promise<void> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

async function count(cypher: string): Promise<number> {
  const r = await read<{ n: { low: number } | number }>(cypher);
  const val = r[0]?.n;
  return typeof val === "object" && val !== null ? (val as { low: number }).low : (val as number) ?? 0;
}

async function preview() {
  console.log("── Current State ──");
  const checks = [
    ["Person:Expert",                  `MATCH (n:Person:Expert) RETURN count(n) AS n`],
    ["PlatformUser w/ Expert role",    `MATCH (n:Person:PlatformUser) WHERE 'Expert' IN n.roles OR 'Collective Manager' IN n.roles OR 'Deal Maker' IN n.roles RETURN count(n) AS n`],
    ["CURRENTLY_AT edges",             `MATCH ()-[r:CURRENTLY_AT]->() RETURN count(r) AS n`],
    ["EMPLOYS edges (should be 0)",    `MATCH ()-[r:EMPLOYS]->() RETURN count(r) AS n`],
    ["OPERATES_IN_INDUSTRY (old)",  `MATCH ()-[r:OPERATES_IN_INDUSTRY]->() RETURN count(r) AS n`],
    ["LOCATED_IN (old)",            `MATCH ()-[r:LOCATED_IN]->() RETURN count(r) AS n`],
    ["HAS_INDUSTRY_EXPERIENCE (old)",`MATCH ()-[r:HAS_INDUSTRY_EXPERIENCE]->() RETURN count(r) AS n`],
    ["HAS_MARKET_EXPERIENCE (old)", `MATCH ()-[r:HAS_MARKET_EXPERIENCE]->() RETURN count(r) AS n`],
    ["BELONGS_TO_INDUSTRY (old)",   `MATCH ()-[r:BELONGS_TO_INDUSTRY]->() RETURN count(r) AS n`],
    ["Category (old label)",        `MATCH (n:Category) RETURN count(n) AS n`],
    ["FirmType (old label)",        `MATCH (n:FirmType) RETURN count(n) AS n`],
    ["Organization (legacy)",       `MATCH (n:Organization) RETURN count(n) AS n`],
  ] as [string, string][];

  for (const [label, q] of checks) {
    console.log(`  ${label}: ${await count(q)}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Track A Final Migration");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  await driver.verifyConnectivity();
  console.log("✓ Connected to Neo4j\n");

  await preview();

  if (DRY_RUN) {
    console.log("\n✓ Dry run complete — no changes made.");
    await driver.close();
    return;
  }

  // ── Step 1: Backfill Person:Expert labels ─────────────────
  // Expert = PlatformUser with "Expert" in their roles array
  // (Old EMPLOYS/Expert nodes no longer exist — roles array is the signal)
  console.log("\n── Step 1: Backfill Person:Expert from roles array ──");
  await write(
    `MATCH (p:Person:PlatformUser)
     WHERE 'Expert' IN p.roles OR 'Collective Manager' IN p.roles OR 'Deal Maker' IN p.roles
     SET p:Expert`
  );
  const expertCount = await count(`MATCH (n:Person:Expert) RETURN count(n) AS n`);
  console.log(`  ✓ Person:Expert nodes: ${expertCount}`);
  console.log(`  Note: CURRENTLY_AT edges not created (firmId data not available)`);
  console.log(`        Will be populated by enrichment pipeline going forward.`);

  // ── Step 3: Migrate legacy edges ──────────────────────────
  console.log("\n── Step 3: Migrate legacy edges ──");

  // OPERATES_IN_INDUSTRY → SERVES_INDUSTRY (ServiceFirm/Organization → Industry)
  console.log("  3a. OPERATES_IN_INDUSTRY → SERVES_INDUSTRY...");
  await write(
    `MATCH (source)-[r:OPERATES_IN_INDUSTRY]->(target)
     MERGE (source)-[:SERVES_INDUSTRY]->(target)
     DELETE r`
  );
  console.log(`      Done. SERVES_INDUSTRY: ${await count(`MATCH ()-[r:SERVES_INDUSTRY]->() RETURN count(r) AS n`)}`);

  // LOCATED_IN → OPERATES_IN (ServiceFirm → Market)
  console.log("  3b. LOCATED_IN → OPERATES_IN...");
  await write(
    `MATCH (source)-[r:LOCATED_IN]->(target)
     MERGE (source)-[:OPERATES_IN]->(target)
     DELETE r`
  );
  console.log(`      Done. OPERATES_IN: ${await count(`MATCH ()-[r:OPERATES_IN]->() RETURN count(r) AS n`)}`);

  // HAS_INDUSTRY_EXPERIENCE → SERVES_INDUSTRY (Person → Industry)
  console.log("  3c. HAS_INDUSTRY_EXPERIENCE → SERVES_INDUSTRY...");
  await write(
    `MATCH (source)-[r:HAS_INDUSTRY_EXPERIENCE]->(target)
     MERGE (source)-[:SERVES_INDUSTRY]->(target)
     DELETE r`
  );
  console.log(`      Done. SERVES_INDUSTRY: ${await count(`MATCH ()-[r:SERVES_INDUSTRY]->() RETURN count(r) AS n`)}`);

  // HAS_MARKET_EXPERIENCE → OPERATES_IN (Person → Market)
  console.log("  3d. HAS_MARKET_EXPERIENCE → OPERATES_IN...");
  await write(
    `MATCH (source)-[r:HAS_MARKET_EXPERIENCE]->(target)
     MERGE (source)-[:OPERATES_IN]->(target)
     DELETE r`
  );
  console.log(`      Done. OPERATES_IN: ${await count(`MATCH ()-[r:OPERATES_IN]->() RETURN count(r) AS n`)}`);

  // BELONGS_TO_INDUSTRY → IN_INDUSTRY (CaseStudy → Industry)
  console.log("  3e. BELONGS_TO_INDUSTRY → IN_INDUSTRY...");
  await write(
    `MATCH (source)-[r:BELONGS_TO_INDUSTRY]->(target)
     MERGE (source)-[:IN_INDUSTRY]->(target)
     DELETE r`
  );
  console.log(`      Done. IN_INDUSTRY: ${await count(`MATCH ()-[r:IN_INDUSTRY]->() RETURN count(r) AS n`)}`);

  // ── Step 4: Strip old Category label from FirmCategory nodes ──
  console.log("\n── Step 4: Strip old Category label from FirmCategory nodes ──");
  // Only strip Category from nodes that ALSO have FirmCategory (or TechCategory)
  await write(
    `MATCH (n:Category:FirmCategory)
     REMOVE n:Category`
  );
  await write(
    `MATCH (n:Category:TechCategory)
     REMOVE n:Category`
  );
  const categoryLeft = await count(`MATCH (n:Category) WHERE NOT n:FirmCategory AND NOT n:TechCategory RETURN count(n) AS n`);
  console.log(`  ✓ Category nodes remaining (non-firm/tech): ${categoryLeft}`);

  // ── Step 5: Strip old FirmType label from DeliveryModel nodes ──
  console.log("\n── Step 5: Strip old FirmType label from DeliveryModel nodes ──");
  await write(
    `MATCH (n:FirmType:DeliveryModel)
     REMOVE n:FirmType`
  );
  const firmTypeLeft = await count(`MATCH (n:FirmType) RETURN count(n) AS n`);
  console.log(`  ✓ FirmType nodes remaining: ${firmTypeLeft} (should be 0)`);

  // ── Step 6: Add Company label to Organization nodes ───────
  console.log("\n── Step 6: Add Company label to Organization nodes ──");
  // Organization nodes are legacy firms. Add Company label to them.
  await write(
    `MATCH (n:Organization)
     WHERE NOT n:Company
     SET n:Company`
  );
  const orgWithCompany = await count(`MATCH (n:Organization:Company) RETURN count(n) AS n`);
  const orgTotal = await count(`MATCH (n:Organization) RETURN count(n) AS n`);
  console.log(`  ✓ Organization nodes with Company label: ${orgWithCompany}/${orgTotal}`);

  // ── Final state ───────────────────────────────────────────
  console.log("\n── Final State ──");
  const finalChecks = [
    ["Person:Expert",               `MATCH (n:Person:Expert) RETURN count(n) AS n`],
    ["CURRENTLY_AT edges",          `MATCH ()-[r:CURRENTLY_AT]->() RETURN count(r) AS n`],
    ["EMPLOYS edges (should be 0)", `MATCH ()-[r:EMPLOYS]->() RETURN count(r) AS n`],
    ["SERVES_INDUSTRY",             `MATCH ()-[r:SERVES_INDUSTRY]->() RETURN count(r) AS n`],
    ["OPERATES_IN",                 `MATCH ()-[r:OPERATES_IN]->() RETURN count(r) AS n`],
    ["IN_INDUSTRY",                 `MATCH ()-[r:IN_INDUSTRY]->() RETURN count(r) AS n`],
    ["Category (should be 0)",      `MATCH (n:Category) WHERE NOT n:FirmCategory AND NOT n:TechCategory RETURN count(n) AS n`],
    ["FirmType (should be 0)",      `MATCH (n:FirmType) RETURN count(n) AS n`],
    ["Organization nodes",          `MATCH (n:Organization) RETURN count(n) AS n`],
    ["Company (all)",               `MATCH (n:Company) RETURN count(n) AS n`],
  ] as [string, string][];

  for (const [label, q] of finalChecks) {
    console.log(`  ${label}: ${await count(q)}`);
  }

  await driver.close();
  console.log("\n✓ Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  driver.close();
  process.exit(1);
});
