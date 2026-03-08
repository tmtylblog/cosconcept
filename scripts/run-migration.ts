/**
 * Run legacy data migration locally.
 *
 * Usage:
 *   npx tsx scripts/run-migration.ts           # run all steps
 *   npx tsx scripts/run-migration.ts 1          # run step 1 only
 *   npx tsx scripts/run-migration.ts 1 2 3      # run steps 1, 2, 3
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local (Next.js convention)
config({ path: resolve(process.cwd(), ".env.local") });

// Dynamically import to ensure env vars are loaded first
async function main() {
  const { runLegacyMigration } = await import("../src/lib/neo4j-migrate-legacy");

  const args = process.argv.slice(2);
  const steps = args.length > 0 ? args.map(Number) : undefined;

  console.log("=== Legacy Data Migration ===");
  console.log(`NEO4J_URI: ${process.env.NEO4J_URI}`);
  console.log(`Steps: ${steps ? steps.join(", ") : "ALL"}`);
  console.log("");

  const result = await runLegacyMigration(steps);

  console.log("");
  console.log("=== RESULTS ===");
  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    console.log("");
    console.log("=== ERRORS ===");
    result.errors.forEach((e) => console.error("  •", e));
  }

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
