/**
 * Migrate: Company becomes the primary node label, ServiceFirm becomes a role label.
 *
 * Architecture change:
 *   BEFORE: MERGE (f:ServiceFirm {id}) SET f:Company  — ServiceFirm was primary
 *   AFTER:  MERGE (f:Company {id}) SET f:ServiceFirm  — Company is primary
 *
 * What this script does:
 *   1. Adds Company label to any ServiceFirm nodes that don't already have it (2 nodes)
 *   2. Drops the old firm_id constraint on ServiceFirm.id
 *   3. Creates the new company_id constraint on Company.id
 *   4. Verifies all edges (HAS_SKILL, IN_CATEGORY, CURRENTLY_AT, etc.) are intact
 *
 * Usage:
 *   npx tsx scripts/migrate-company-primary-label.ts --dry-run
 *   npx tsx scripts/migrate-company-primary-label.ts
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

async function read<T>(cypher: string): Promise<T[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try { return (await session.run(cypher)).records.map(r => r.toObject() as T); }
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
  console.log("  Migrate: Company → primary label, ServiceFirm → role label");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  await driver.verifyConnectivity();

  // ── Current state ──────────────────────────────────────
  console.log("── Current state ──");
  console.log("  Company (all):                 ", await cnt("MATCH (n:Company) RETURN count(n) AS n"));
  console.log("  Company:ServiceFirm (both):    ", await cnt("MATCH (n:Company:ServiceFirm) RETURN count(n) AS n"));
  console.log("  ServiceFirm only (no Company): ", await cnt("MATCH (n:ServiceFirm) WHERE NOT n:Company RETURN count(n) AS n"));
  console.log("  Company only (no ServiceFirm): ", await cnt("MATCH (n:Company) WHERE NOT n:ServiceFirm RETURN count(n) AS n"));

  console.log("\n── Current constraints ──");
  const constraints = await read<any>("SHOW CONSTRAINTS");
  const relevantConstraints = constraints.filter((c: any) =>
    (c.labelsOrTypes?.includes("Company") || c.labelsOrTypes?.includes("ServiceFirm"))
  );
  for (const c of relevantConstraints) {
    console.log(`  ${c.name}: ${c.entityType} ${JSON.stringify(c.labelsOrTypes)} ${JSON.stringify(c.properties)}`);
  }

  console.log("\n── Edge counts (verify nothing breaks) ──");
  const edges = [
    ["HAS_SKILL (Company:ServiceFirm → Skill)",  "MATCH (n:Company:ServiceFirm)-[r:HAS_SKILL]->() RETURN count(r) AS n"],
    ["IN_CATEGORY (→ FirmCategory)",             "MATCH (n:Company:ServiceFirm)-[r:IN_CATEGORY]->() RETURN count(r) AS n"],
    ["SERVES_INDUSTRY",                          "MATCH (n:Company:ServiceFirm)-[r:SERVES_INDUSTRY]->() RETURN count(r) AS n"],
    ["OPERATES_IN",                              "MATCH (n:Company:ServiceFirm)-[r:OPERATES_IN]->() RETURN count(r) AS n"],
    ["PREFERS",                                  "MATCH (n:Company:ServiceFirm)-[r:PREFERS]->() RETURN count(r) AS n"],
    ["Person-[CURRENTLY_AT]->Company:ServiceFirm", "MATCH ()-[r:CURRENTLY_AT]->(n:Company:ServiceFirm) RETURN count(r) AS n"],
    ["HAS_CASE_STUDY",                           "MATCH (n:Company:ServiceFirm)-[r:HAS_CASE_STUDY]->() RETURN count(r) AS n"],
    ["AUTHORED_BY (CaseStudy→Person)",           "MATCH ()-[r:AUTHORED_BY]->(n:Person) RETURN count(r) AS n"],
  ];
  for (const [label, q] of edges) {
    console.log(`  ${label}: ${await cnt(q)}`);
  }

  if (DRY_RUN) {
    console.log("\n✓ Dry run complete — no changes made.");
    await driver.close();
    return;
  }

  // ── Step 1: Add Company label to ServiceFirm-only nodes ──
  console.log("\n── Step 1: Add Company label to ServiceFirm-only nodes ──");
  const orphans = await cnt("MATCH (n:ServiceFirm) WHERE NOT n:Company RETURN count(n) AS n");
  console.log(`  Found ${orphans} ServiceFirm nodes without Company label`);
  if (orphans > 0) {
    await write("MATCH (n:ServiceFirm) WHERE NOT n:Company SET n:Company");
    console.log(`  ✓ Added Company label to ${orphans} nodes`);
  } else {
    console.log("  ✓ Nothing to do");
  }

  // ── Step 2: Drop old firm_id constraint on ServiceFirm ──
  console.log("\n── Step 2: Drop old firm_id constraint on ServiceFirm.id ──");
  try {
    await write("DROP CONSTRAINT firm_id IF EXISTS");
    console.log("  ✓ Dropped firm_id constraint");
  } catch (err) {
    console.log("  ℹ firm_id constraint not found (already dropped or never existed)");
  }

  // ── Step 3: Create company_id constraint on Company.id ──
  console.log("\n── Step 3: Create company_id constraint on Company.id ──");
  try {
    await write("CREATE CONSTRAINT company_id IF NOT EXISTS FOR (n:Company) REQUIRE n.id IS UNIQUE");
    console.log("  ✓ Created company_id constraint");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists") || msg.includes("equivalent")) {
      console.log("  ✓ company_id constraint already exists");
    } else {
      console.error("  ✗ Failed to create company_id constraint:", msg);
    }
  }

  // ── Final state ───────────────────────────────────────
  console.log("\n── Final state ──");
  console.log("  Company (all):                 ", await cnt("MATCH (n:Company) RETURN count(n) AS n"));
  console.log("  Company:ServiceFirm (both):    ", await cnt("MATCH (n:Company:ServiceFirm) RETURN count(n) AS n"));
  console.log("  ServiceFirm only (no Company): ", await cnt("MATCH (n:ServiceFirm) WHERE NOT n:Company RETURN count(n) AS n"));

  console.log("\n── Edge integrity after migration ──");
  for (const [label, q] of edges) {
    console.log(`  ${label}: ${await cnt(q)}`);
  }

  await driver.close();
  console.log("\n✓ Done. Company is now the primary label. ServiceFirm is a role label.");
}

main().catch(err => { console.error("Fatal:", err); driver.close(); process.exit(1); });
