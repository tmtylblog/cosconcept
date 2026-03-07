/**
 * CLI Script: Seed Neo4j Knowledge Graph
 *
 * Usage: npx tsx scripts/seed-neo4j.ts
 *
 * This script:
 * 1. Sets up Neo4j schema (constraints + indexes)
 * 2. Seeds all taxonomy data (categories, skills, relationships, markets, etc.)
 *
 * Requires NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD in .env
 */

import "dotenv/config";
import { setupNeo4jSchema } from "../src/lib/neo4j-schema";
import { seedNeo4jTaxonomy } from "../src/lib/neo4j-seed";
import { neo4jDriver } from "../src/lib/neo4j";

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  COS — Neo4j Knowledge Graph Seeding");
  console.log("═══════════════════════════════════════════\n");

  // Verify connection
  const uri = process.env.NEO4J_URI;
  if (!uri) {
    console.error("ERROR: NEO4J_URI not set in .env");
    process.exit(1);
  }
  console.log(`Connecting to: ${uri}\n`);

  try {
    // Verify connectivity
    await neo4jDriver.verifyConnectivity();
    console.log("Connected to Neo4j successfully.\n");
  } catch (err) {
    console.error("Failed to connect to Neo4j:", err);
    process.exit(1);
  }

  // Step 1: Schema
  console.log("── Step 1: Setting up schema ──────────────\n");
  const schema = await setupNeo4jSchema();
  console.log(
    `  Constraints: ${schema.constraints}, Indexes: ${schema.indexes}`
  );
  if (schema.errors.length) {
    console.warn("  Schema errors:", schema.errors);
  }
  console.log();

  // Step 2: Seed taxonomy
  console.log("── Step 2: Seeding taxonomy data ──────────\n");
  const seed = await seedNeo4jTaxonomy();
  console.log();
  console.log("  ┌─────────────────────────────────────┐");
  console.log("  │         Seed Results Summary         │");
  console.log("  ├─────────────────────────────────────┤");
  console.log(`  │  Categories:        ${String(seed.categories).padStart(6)} │`);
  console.log(`  │  Skills L1:         ${String(seed.skillsL1).padStart(6)} │`);
  console.log(`  │  Skills L2:         ${String(seed.skillsL2).padStart(6)} │`);
  console.log(`  │  Skills L3:         ${String(seed.skillsL3).padStart(6)} │`);
  console.log(`  │  Firm Relationships: ${String(seed.firmRelationships).padStart(5)} │`);
  console.log(`  │  Markets:           ${String(seed.markets).padStart(6)} │`);
  console.log(`  │  Languages:         ${String(seed.languages).padStart(6)} │`);
  console.log(`  │  Firm Types:        ${String(seed.firmTypes).padStart(6)} │`);
  console.log(`  │  Industries:        ${String(seed.industries).padStart(6)} │`);
  console.log("  ├─────────────────────────────────────┤");
  console.log(`  │  TOTAL NODES:       ${String(seed.totalNodes).padStart(6)} │`);
  console.log(`  │  Duration:        ${String(seed.durationMs).padStart(5)}ms │`);
  console.log("  └─────────────────────────────────────┘");

  if (seed.errors.length) {
    console.warn("\n  Errors:", seed.errors);
  }

  // Close driver
  await neo4jDriver.close();
  console.log("\nDone. Neo4j driver closed.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
