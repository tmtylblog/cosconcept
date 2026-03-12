/**
 * Final Cleanup — Strip legacy node labels that have been migrated
 *
 * Steps:
 *   1. Strip Organization label (nodes already have Company label)
 *   2. Delete old Category-only nodes (they're not in our FirmCategory taxonomy
 *      and have no IN_CATEGORY edges — just old legacy categorization data)
 *   3. Fix duplicate company_domain (17-sport.com) — delete the dupe
 *
 * Usage:
 *   npx tsx scripts/migrate-final-cleanup.ts --dry-run
 *   npx tsx scripts/migrate-final-cleanup.ts
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

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Final Cleanup");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  await driver.verifyConnectivity();
  console.log("✓ Connected to Neo4j\n");

  console.log("── Current State ──");
  console.log(`  Organization label:        ${await count(`MATCH (n:Organization) RETURN count(n) AS n`)}`);
  console.log(`  Category-only nodes:       ${await count(`MATCH (n:Category) WHERE NOT n:FirmCategory AND NOT n:TechCategory RETURN count(n) AS n`)}`);
  console.log(`  Category w/ PARTNERS_WITH: ${await count(`MATCH (n:Category) WHERE NOT n:FirmCategory AND NOT n:TechCategory AND (exists((n)-[:PARTNERS_WITH]-()) OR exists(()-[:PARTNERS_WITH]->(n))) RETURN count(DISTINCT n) AS n`)}`);
  console.log(`  Duplicate company domains: ${await count(`MATCH (n:Company) WITH n.domain AS d, count(*) AS c WHERE c > 1 AND d IS NOT NULL RETURN count(DISTINCT d) AS n`)}`);

  // Check what edges the old Category nodes have
  const edgeTypes = await read<{ type: string; cnt: { low: number } }>(
    `MATCH (n:Category)-[r]-() WHERE NOT n:FirmCategory AND NOT n:TechCategory
     RETURN type(r) AS type, count(r) AS cnt ORDER BY cnt DESC LIMIT 10`
  );
  console.log("\n  Edge types on old Category nodes:");
  for (const row of edgeTypes) {
    const cnt = typeof row.cnt === "object" ? (row.cnt as { low: number }).low : row.cnt;
    console.log(`    ${row.type}: ${cnt}`);
  }

  if (DRY_RUN) {
    console.log("\n✓ Dry run complete — no changes made.");
    await driver.close();
    return;
  }

  // ── Step 1: Strip Organization label ──────────────────────
  console.log("\n── Step 1: Strip Organization label (nodes have Company) ──");
  await write(`MATCH (n:Organization:Company) REMOVE n:Organization`);
  console.log(`  ✓ Organization nodes remaining: ${await count(`MATCH (n:Organization) RETURN count(n) AS n`)} (should be 0)`);

  // ── Step 2: Delete old Category-only nodes ─────────────────
  // These are legacy free-form category labels with only PARTNERS_WITH edges.
  // Not useful for Track A — our canonical categories are FirmCategory/TechCategory.
  console.log("\n── Step 2: Delete old Category-only nodes ──");
  const catCount = await count(`MATCH (n:Category) WHERE NOT n:FirmCategory AND NOT n:TechCategory RETURN count(n) AS n`);
  console.log(`  About to delete ${catCount} old Category nodes (and their edges)...`);
  await write(`MATCH (n:Category) WHERE NOT n:FirmCategory AND NOT n:TechCategory DETACH DELETE n`);
  console.log(`  ✓ Category nodes remaining: ${await count(`MATCH (n:Category) RETURN count(n) AS n`)}`);

  // ── Step 3: Domain deduplication ─────────────────────────
  // Skipped — 2,057 duplicate domains found. This requires careful investigation
  // to determine which Company nodes to keep (Organization vs ServiceFirm).
  // Run migrate-dedup-companies.ts separately.
  console.log("\n── Step 3: Domain deduplication (skipped — see migrate-dedup-companies.ts) ──");

  // ── Final state ───────────────────────────────────────────
  console.log("\n── Final State ──");
  const finals = [
    ["Organization label",    `MATCH (n:Organization) RETURN count(n) AS n`],
    ["Category-only nodes",   `MATCH (n:Category) WHERE NOT n:FirmCategory AND NOT n:TechCategory RETURN count(n) AS n`],
    ["Company total",         `MATCH (n:Company) RETURN count(n) AS n`],
    ["Company:ServiceFirm",   `MATCH (n:Company:ServiceFirm) RETURN count(n) AS n`],
    ["PARTNERS_WITH edges",   `MATCH ()-[r:PARTNERS_WITH]->() RETURN count(r) AS n`],
  ] as [string, string][];

  for (const [label, q] of finals) {
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
