/**
 * One-time sync script: Bridge Neo4j firm IDs to PostgreSQL service_firms.id
 *
 * Problem: Neo4j Company:ServiceFirm nodes use coalesce(f.id, f.neonId, 'legacy:'+f.legacyOrgId)
 * as firmId. Only ~4 of 1,050 firms have a valid f.id matching PG serviceFirms.id.
 *
 * Solution: For each PG serviceFirm, find the matching Neo4j node by organizationId,
 * domain, or name, and SET f.id = pgFirmId.
 *
 * Usage: npx tsx scripts/sync-neo4j-firm-ids.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { text, pgTable } from "drizzle-orm/pg-core";
import neo4j from "neo4j-driver";

// Minimal schema reference for the query
const serviceFirms = pgTable("service_firms", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  website: text("website"),
});

async function main() {
  // 1. Connect to PG
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // 2. Connect to Neo4j
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
  );

  // 3. Load all PG firms
  const pgFirms = await db.select().from(serviceFirms);
  console.log(`[Sync] Loaded ${pgFirms.length} firms from PostgreSQL`);

  // 4. First, build a set of all PG firm IDs so we know which ids are "taken"
  const pgFirmIds = new Set(pgFirms.map((f) => f.id));

  // 5. Also check which ids are already assigned in Neo4j to avoid conflicts
  const checkSession = driver.session({ defaultAccessMode: neo4j.session.READ });
  const existingIds = new Set<string>();
  try {
    const res = await checkSession.run(
      `MATCH (f:Company) WHERE f.id IS NOT NULL RETURN f.id AS id`
    );
    for (const r of res.records) {
      existingIds.add(r.get("id"));
    }
    console.log(`[Sync] ${existingIds.size} existing Neo4j node IDs found`);
  } finally {
    await checkSession.close();
  }

  let matched = 0;
  let unmatched = 0;
  let alreadyCorrect = 0;
  let skippedConflict = 0;
  const unmatchedFirms: string[] = [];

  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });

  try {
    for (const firm of pgFirms) {
      const domain = firm.website ? extractDomain(firm.website) : null;

      // Try to match by organizationId first, then domain, then name
      const result = await session.run(
        `MATCH (f:Company:ServiceFirm)
         WHERE f.organizationId = $orgId
            OR ($domain IS NOT NULL AND f.domain = $domain)
            OR ($domain IS NOT NULL AND f.website CONTAINS $domain)
            OR f.name = $name
         RETURN f.id AS currentId, f.name AS name, f.organizationId AS orgId, f.domain AS domain,
                elementId(f) AS nodeId
         LIMIT 5`,
        {
          orgId: firm.organizationId,
          domain,
          name: firm.name,
        }
      );

      if (result.records.length === 0) {
        unmatched++;
        unmatchedFirms.push(`${firm.id} (${firm.name})`);
        continue;
      }

      // Pick the best match: prefer orgId match, then first
      const exactOrgMatch = result.records.find(
        (r) => r.get("orgId") === firm.organizationId
      );
      const pick = exactOrgMatch ?? result.records[0];
      const currentId = pick.get("currentId");

      // Already has the correct ID
      if (currentId === firm.id) {
        alreadyCorrect++;
        continue;
      }

      // Check for uniqueness conflict: another node already has this id
      if (existingIds.has(firm.id) && currentId !== firm.id) {
        skippedConflict++;
        console.log(`  [Skip] ${firm.name} → ${firm.id} conflicts with existing node`);
        continue;
      }

      try {
        await session.run(
          `MATCH (f:Company:ServiceFirm)
           WHERE elementId(f) = $nodeId
           SET f.id = $pgFirmId`,
          { nodeId: pick.get("nodeId"), pgFirmId: firm.id }
        );
        matched++;
        existingIds.add(firm.id); // Track the newly assigned id
        if (matched <= 10 || matched % 50 === 0) {
          console.log(`  [Match] ${firm.name} → ${firm.id} (was: ${currentId})`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ConstraintValidation") || msg.includes("already exists")) {
          skippedConflict++;
          console.log(`  [Skip] ${firm.name} → ${firm.id} (constraint conflict)`);
        } else {
          throw err;
        }
      }
    }
  } finally {
    await session.close();
  }

  // 6. Validation: check for any remaining nodes without valid firm_ IDs
  const validateSession = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const validation = await validateSession.run(
      `MATCH (f:Company:ServiceFirm)
       WHERE f.id IS NULL OR NOT f.id STARTS WITH 'firm_'
       RETURN count(f) AS badCount`
    );
    const badCount = validation.records[0]?.get("badCount")?.toNumber?.() ?? validation.records[0]?.get("badCount") ?? "?";

    console.log("\n════════════════════════════════════");
    console.log(`  Already correct: ${alreadyCorrect}`);
    console.log(`  Newly matched:   ${matched}`);
    console.log(`  Skipped (conflict): ${skippedConflict}`);
    console.log(`  Unmatched:       ${unmatched}`);
    console.log(`  Bad IDs remaining: ${badCount}`);
    console.log("════════════════════════════════════");

    if (unmatchedFirms.length > 0 && unmatchedFirms.length <= 30) {
      console.log("\nUnmatched firms:");
      unmatchedFirms.forEach((f) => console.log(`  - ${f}`));
    } else if (unmatchedFirms.length > 30) {
      console.log(`\nUnmatched firms: ${unmatchedFirms.length} total (showing first 30):`);
      unmatchedFirms.slice(0, 30).forEach((f) => console.log(`  - ${f}`));
    }
  } finally {
    await validateSession.close();
  }

  await driver.close();
}

function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
