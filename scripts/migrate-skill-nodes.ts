/**
 * Migration: Consolidate all skills into a single Skill label (L1/L2/L3)
 *
 * Track A design: single Skill node for all levels.
 *   Skill {level:"L1"} ← BELONGS_TO — Skill {level:"L2"} ← BELONGS_TO — Skill {level:"L3"}
 *
 * Steps:
 *   1. Strip SkillL1 label from 18,335 legacy-polluted nodes (they stay as LegacySkill)
 *   2. Relabel the 26 real L1 nodes: SkillL1 → Skill {level:"L1"}
 *   3. Fix BELONGS_TO edges from L2 Skill → now point to Skill (L1) not SkillL1
 *   4. LegacySkill → merge into Skill by name, transfer all edges, delete LegacySkill nodes
 *
 * Usage:
 *   npx tsx scripts/migrate-skill-nodes.ts --dry-run
 *   npx tsx scripts/migrate-skill-nodes.ts
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

async function countQ(cypher: string): Promise<number> {
  const r = await read<{ n: { low: number } | number }>(cypher);
  const val = r[0]?.n;
  return typeof val === "object" && val !== null ? (val as { low: number }).low : (val as number) ?? 0;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Migrate Skills → Single Skill Label (L1/L2/L3)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  await driver.verifyConnectivity();
  console.log("✓ Connected to Neo4j\n");

  // ── Preview ─────────────────────────────────────────────
  console.log("── Current state ──");
  const realL1 = await countQ(`MATCH (n:SkillL1) WHERE n.level = 'L1' RETURN count(n) AS n`);
  const pollutedL1 = await countQ(`MATCH (n:SkillL1) WHERE n.level IS NULL OR n.level <> 'L1' RETURN count(n) AS n`);
  const legacySkills = await countQ(`MATCH (n:LegacySkill) RETURN count(n) AS n`);
  const currentSkills = await countQ(`MATCH (n:Skill) RETURN count(n) AS n`);

  console.log(`  SkillL1 (real L1 nodes):       ${realL1}`);
  console.log(`  SkillL1 (legacy-polluted):     ${pollutedL1}`);
  console.log(`  LegacySkill nodes:             ${legacySkills}`);
  console.log(`  Skill nodes (current):         ${currentSkills}`);

  // Edge counts on LegacySkill
  const hasSkillEdges = await countQ(`MATCH ()-[r:HAS_SKILL]->(:LegacySkill) RETURN count(r) AS n`);
  const demonstratesEdges = await countQ(`MATCH ()-[r:DEMONSTRATES_SKILL]->(:LegacySkill) RETURN count(r) AS n`);
  const belongsToEdges = await countQ(`MATCH (:LegacySkill)-[r:BELONGS_TO]->() RETURN count(r) AS n`);
  console.log(`\n  Edges on LegacySkill nodes:`);
  console.log(`    HAS_SKILL → LegacySkill:        ${hasSkillEdges}`);
  console.log(`    DEMONSTRATES_SKILL → LegacySkill: ${demonstratesEdges}`);
  console.log(`    LegacySkill → BELONGS_TO:        ${belongsToEdges}`);

  if (DRY_RUN) {
    console.log("\n✓ Dry run complete — no changes made.");
    await driver.close();
    return;
  }

  // ── Step 1: Strip SkillL1 label from legacy-polluted nodes ──
  console.log("\n── Step 1: Strip SkillL1 from legacy-polluted nodes ──");
  await write(
    `MATCH (n:SkillL1)
     WHERE n.level IS NULL OR n.level <> 'L1'
     REMOVE n:SkillL1`
  );
  const remainingL1 = await countQ(`MATCH (n:SkillL1) RETURN count(n) AS n`);
  console.log(`  ✓ SkillL1 nodes remaining (should be 26): ${remainingL1}`);

  // ── Step 2: Merge SkillL1 nodes INTO existing Skill nodes ──
  // Can't relabel in-place — the Skill.name uniqueness constraint blocks it
  // because seed already created Skill nodes with the same names.
  // Instead: copy legacyId to the existing Skill node, repoint BELONGS_TO edges, delete SkillL1.
  console.log("\n── Step 2: Merge SkillL1 → existing Skill nodes ──");

  // 2a. Mark matched Skill nodes as level L1 and copy legacyId
  await write(
    `MATCH (l1:SkillL1)
     MATCH (s:Skill {name: l1.name})
     SET s.level = 'L1',
         s.legacyId = coalesce(l1.legacyId, s.legacyId)`
  );

  // 2b. Repoint BELONGS_TO edges: (l2:Skill)-[:BELONGS_TO]->(l1:SkillL1) → (l2:Skill)-[:BELONGS_TO]->(s:Skill)
  await write(
    `MATCH (l2:Skill)-[r:BELONGS_TO]->(l1:SkillL1)
     MATCH (s:Skill {name: l1.name, level: 'L1'})
     MERGE (l2)-[:BELONGS_TO]->(s)
     DELETE r`
  );

  // 2c. For SkillL1 nodes with NO matching Skill — create a new Skill node
  await write(
    `MATCH (l1:SkillL1)
     WHERE NOT EXISTS { MATCH (s:Skill {name: l1.name}) }
     MERGE (s:Skill {name: l1.name})
     SET s.level = 'L1', s.legacyId = l1.legacyId`
  );
  // Repoint edges for newly created Skill nodes
  await write(
    `MATCH (l2:Skill)-[r:BELONGS_TO]->(l1:SkillL1)
     MATCH (s:Skill {name: l1.name})
     MERGE (l2)-[:BELONGS_TO]->(s)
     DELETE r`
  );

  // 2d. Delete all SkillL1 nodes (no edges left)
  await write(`MATCH (n:SkillL1) DETACH DELETE n`);

  const l1Skills = await countQ(`MATCH (n:Skill {level:'L1'}) RETURN count(n) AS n`);
  const skillL1After = await countQ(`MATCH (n:SkillL1) RETURN count(n) AS n`);
  console.log(`  ✓ Skill {level:'L1'} nodes: ${l1Skills} (expected: 26)`);
  console.log(`  ✓ SkillL1 nodes remaining:  ${skillL1After} (should be 0)`);

  // ── Step 3: Fix BELONGS_TO edges L2 → L1 ──────────────
  // These edges previously pointed to SkillL1 nodes. Now those are Skill nodes.
  // The edges are already correct since it's the same node — just verify count.
  console.log("\n── Step 3: Verify BELONGS_TO edges L2→L1 ──");
  const l2ToL1 = await countQ(
    `MATCH (l2:Skill {level:'L2'})-[:BELONGS_TO]->(l1:Skill {level:'L1'}) RETURN count(*) AS n`
  );
  console.log(`  L2→L1 BELONGS_TO edges: ${l2ToL1} (expected ~246)`);

  // ── Step 4: Migrate LegacySkill → Skill ───────────────
  console.log("\n── Step 4: Migrate LegacySkill → Skill ──");

  // 4a. For LegacySkill nodes that have a matching Skill by name:
  //     transfer all edges and add legacyId to the Skill node
  console.log("  4a. Transferring HAS_SKILL edges (LegacySkill → matched Skill)...");
  await write(
    `MATCH (source)-[r:HAS_SKILL]->(ls:LegacySkill)
     MATCH (s:Skill {name: ls.name})
     MERGE (source)-[:HAS_SKILL]->(s)
     DELETE r`
  );

  console.log("  4b. Transferring DEMONSTRATES_SKILL edges...");
  await write(
    `MATCH (source)-[r:DEMONSTRATES_SKILL]->(ls:LegacySkill)
     MATCH (s:Skill {name: ls.name})
     MERGE (source)-[:DEMONSTRATES_SKILL]->(s)
     DELETE r`
  );

  console.log("  4c. Stamping legacyId onto matched Skill nodes...");
  await write(
    `MATCH (ls:LegacySkill)
     MATCH (s:Skill {name: ls.name})
     SET s.legacyId = ls.legacyId`
  );

  // 4d. For LegacySkill nodes with NO matching Skill — create new Skill nodes
  //     Map legacy levels: L0→L1, L1→L2, L2→L3
  console.log("  4d. Creating Skill nodes for unmatched LegacySkill nodes...");
  await write(
    `MATCH (ls:LegacySkill)
     WHERE NOT EXISTS { MATCH (s:Skill {name: ls.name}) }
     MERGE (s:Skill {name: ls.name})
     SET s.level = CASE ls.level
       WHEN 'L0' THEN 'L1'
       WHEN 'L1' THEN 'L2'
       WHEN 'L2' THEN 'L3'
       ELSE 'L2'
     END,
     s.legacyId = ls.legacyId`
  );

  // Transfer remaining edges to newly created Skill nodes
  await write(
    `MATCH (source)-[r:HAS_SKILL]->(ls:LegacySkill)
     MATCH (s:Skill {name: ls.name})
     MERGE (source)-[:HAS_SKILL]->(s)
     DELETE r`
  );
  await write(
    `MATCH (source)-[r:DEMONSTRATES_SKILL]->(ls:LegacySkill)
     MATCH (s:Skill {name: ls.name})
     MERGE (source)-[:DEMONSTRATES_SKILL]->(s)
     DELETE r`
  );

  // 4e. Delete all remaining LegacySkill nodes (and any leftover edges)
  console.log("  4e. Deleting LegacySkill nodes...");
  await write(`MATCH (n:LegacySkill) DETACH DELETE n`);

  // ── Final state ──────────────────────────────────────────
  console.log("\n── Final state ──");
  const finalL1 = await countQ(`MATCH (n:Skill {level:'L1'}) RETURN count(n) AS n`);
  const finalL2 = await countQ(`MATCH (n:Skill {level:'L2'}) RETURN count(n) AS n`);
  const finalL3 = await countQ(`MATCH (n:Skill {level:'L3'}) RETURN count(n) AS n`);
  const finalTotal = await countQ(`MATCH (n:Skill) RETURN count(n) AS n`);
  const finalLegacy = await countQ(`MATCH (n:LegacySkill) RETURN count(n) AS n`);
  const finalSkillL1 = await countQ(`MATCH (n:SkillL1) RETURN count(n) AS n`);
  const finalBelongsTo = await countQ(`MATCH (l2:Skill {level:'L2'})-[:BELONGS_TO]->(l1:Skill {level:'L1'}) RETURN count(*) AS n`);
  const finalHasSkill = await countQ(`MATCH ()-[r:HAS_SKILL]->(:Skill) RETURN count(r) AS n`);

  console.log(`  Skill {level:'L1'}:  ${finalL1} (expected: 26)`);
  console.log(`  Skill {level:'L2'}:  ${finalL2} (expected: ~246)`);
  console.log(`  Skill {level:'L3'}:  ${finalL3} (expected: ~18,420)`);
  console.log(`  Skill total:         ${finalTotal}`);
  console.log(`  SkillL1 remaining:   ${finalSkillL1} (should be 0)`);
  console.log(`  LegacySkill remaining: ${finalLegacy} (should be 0)`);
  console.log(`  L2→L1 BELONGS_TO:    ${finalBelongsTo}`);
  console.log(`  HAS_SKILL edges:     ${finalHasSkill}`);

  await driver.close();
  console.log("\n✓ Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  driver.close();
  process.exit(1);
});
