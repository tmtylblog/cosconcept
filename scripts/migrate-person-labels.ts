/**
 * Migration: Apply Person Sub-Labels to Existing Neo4j Nodes
 *
 * Track A pattern: Person is the base label. Sub-labels distinguish type:
 *   Person:Expert       — professional employed at a COS member firm (CURRENTLY_AT ServiceFirm)
 *   Person:Contact      — imported external contact from n8n (WORKS_AT Company, has sourceId)
 *   Person:PlatformUser — COS account holder (migrated from legacy User nodes or has pgUserId)
 *
 * A node can carry multiple sub-labels (e.g. Person:Expert:PlatformUser).
 *
 * This is a one-time backfill. graph-writer.ts, sync-graph route, and future
 * writers now set the correct sub-labels on create/update.
 *
 * Usage:
 *   npx tsx scripts/migrate-person-labels.ts            # live run
 *   npx tsx scripts/migrate-person-labels.ts --dry-run  # preview counts only
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import neo4j, { type Driver } from "neo4j-driver";

function createDriver(): Driver {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;
  if (!uri || !username || !password) {
    console.error("❌ Missing NEO4J_URI, NEO4J_USERNAME, or NEO4J_PASSWORD in .env.local");
    process.exit(1);
  }
  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

const driver = createDriver();
const DRY_RUN = process.argv.includes("--dry-run");

async function read<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

async function write(cypher: string, params: Record<string, unknown> = {}): Promise<number> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    const summary = result.summary.counters.updates();
    return summary.labelsAdded ?? 0;
  } finally {
    await session.close();
  }
}

async function count(cypher: string): Promise<number> {
  const result = await read<{ n: { low: number } }>(cypher);
  const val = result[0]?.n;
  return typeof val === "object" ? val.low : (val as number) ?? 0;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Migrate Person Sub-Labels (Expert / Contact / PlatformUser)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE"}\n`);

  await driver.verifyConnectivity();
  console.log("✓ Connected to Neo4j\n");

  // ── Preview counts ─────────────────────────────────────────

  const totalPerson = await count(`MATCH (n:Person) RETURN count(n) AS n`);
  const alreadyExpert = await count(`MATCH (n:Person:Expert) RETURN count(n) AS n`);
  const alreadyContact = await count(`MATCH (n:Person:Contact) RETURN count(n) AS n`);
  const alreadyPlatformUser = await count(`MATCH (n:Person:PlatformUser) RETURN count(n) AS n`);
  const totalUserNodes = await count(`MATCH (n:User) WHERE NOT n:Person RETURN count(n) AS n`);

  console.log("── Current state ──");
  console.log(`  Person nodes total:          ${totalPerson}`);
  console.log(`  Already :Expert:             ${alreadyExpert}`);
  console.log(`  Already :Contact:            ${alreadyContact}`);
  console.log(`  Already :PlatformUser:       ${alreadyPlatformUser}`);
  console.log(`  Legacy User nodes (no :Person): ${totalUserNodes}`);

  // ── What will be labeled ────────────────────────────────────

  const toLabel = {
    expert: await count(
      `MATCH (p:Person)-[:CURRENTLY_AT]->(:ServiceFirm)
       WHERE NOT p:Expert
       RETURN count(p) AS n`
    ),
    contact: await count(
      `MATCH (p:Person)
       WHERE p.sourceId IS NOT NULL AND NOT p:Contact
       RETURN count(p) AS n`
    ),
    userToPlatformUser: totalUserNodes,
    personWithPgUserId: await count(
      `MATCH (p:Person)
       WHERE p.pgUserId IS NOT NULL AND NOT p:PlatformUser
       RETURN count(p) AS n`
    ),
  };

  console.log("\n── Will apply ──");
  console.log(`  Add :Expert to Person nodes with CURRENTLY_AT ServiceFirm: ${toLabel.expert}`);
  console.log(`  Add :Contact to Person nodes with sourceId (n8n imports):  ${toLabel.contact}`);
  console.log(`  Convert User → Person:PlatformUser:                        ${toLabel.userToPlatformUser}`);
  console.log(`  Add :PlatformUser to Person nodes with pgUserId:           ${toLabel.personWithPgUserId}`);

  if (DRY_RUN) {
    console.log("\n✓ Dry run complete — no changes made.");
    await driver.close();
    return;
  }

  console.log("\n── Applying labels ──\n");

  // 1. Person:Expert — anyone with CURRENTLY_AT edge to a ServiceFirm
  const expertLabeled = await write(
    `MATCH (p:Person)-[:CURRENTLY_AT]->(:ServiceFirm)
     WHERE NOT p:Expert
     SET p:Expert`
  );
  console.log(`  ✓ :Expert applied: ${expertLabeled} nodes`);

  // 2. Person:Contact — anyone with sourceId (came from importedContacts / n8n)
  const contactLabeled = await write(
    `MATCH (p:Person)
     WHERE p.sourceId IS NOT NULL AND NOT p:Contact
     SET p:Contact`
  );
  console.log(`  ✓ :Contact applied: ${contactLabeled} nodes`);

  // 3. Legacy User nodes → Person:PlatformUser
  // Copy all properties, add Person + PlatformUser labels
  const userConverted = await write(
    `MATCH (u:User)
     WHERE NOT u:Person
     SET u:Person:PlatformUser`
  );
  console.log(`  ✓ User → Person:PlatformUser: ${userConverted} nodes`);

  // 4. Person nodes that already have a pgUserId (linked to a Postgres user)
  const pgUserLabeled = await write(
    `MATCH (p:Person)
     WHERE p.pgUserId IS NOT NULL AND NOT p:PlatformUser
     SET p:PlatformUser`
  );
  console.log(`  ✓ :PlatformUser applied (pgUserId): ${pgUserLabeled} nodes`);

  // ── Final state ─────────────────────────────────────────────

  console.log("\n── Final state ──");
  console.log(`  Person:Expert:       ${await count(`MATCH (n:Person:Expert) RETURN count(n) AS n`)}`);
  console.log(`  Person:Contact:      ${await count(`MATCH (n:Person:Contact) RETURN count(n) AS n`)}`);
  console.log(`  Person:PlatformUser: ${await count(`MATCH (n:Person:PlatformUser) RETURN count(n) AS n`)}`);
  console.log(`  Person (no sub-label): ${await count(
    `MATCH (n:Person)
     WHERE NOT n:Expert AND NOT n:Contact AND NOT n:PlatformUser
     RETURN count(n) AS n`
  )} (stubs awaiting enrichment)`);

  await driver.close();
  console.log("\n✓ Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  driver.close();
  process.exit(1);
});
