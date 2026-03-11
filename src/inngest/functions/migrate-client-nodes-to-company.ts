/**
 * One-time Migration: Convert legacy Client nodes → Company stubs in Neo4j.
 *
 * Legacy Client nodes were created by the old graph-writer before Track A.
 * This job:
 * 1. Finds all Client nodes that do NOT already have a Company counterpart
 * 2. Merges each into a Company stub (domain or name key)
 * 3. Repoints HAS_CLIENT and FOR_CLIENT edges to the canonical Company node
 * 4. Marks old Client nodes as isLegacy = true (not deleted — safe fallback)
 *
 * Idempotent — safe to run multiple times.
 * Triggered manually from admin or via: inngest.send({ name: "migration/client-nodes-to-company" })
 */

import { inngest } from "../client";
import { neo4jWrite } from "@/lib/neo4j";

export const migrateClientNodesToCompany = inngest.createFunction(
  {
    id: "migration-client-nodes-to-company",
    name: "Migration: Client Nodes → Company",
    retries: 2,
    // Concurrency: 1 — one migration at a time
    concurrency: { limit: 1 },
  },
  { event: "migration/client-nodes-to-company" },
  async ({ step }) => {
    // Step 1: Count legacy Client nodes to migrate
    const stats = await step.run("count-legacy-clients", async () => {
      const result = await neo4jWrite(
        `MATCH (c:Client)
         WHERE NOT c:Company
         RETURN count(c) AS total`,
        {}
      );
      return { total: (result as { total: number }[])[0]?.total ?? 0 };
    });

    if (stats.total === 0) {
      return { message: "No legacy Client nodes to migrate", migrated: 0 };
    }

    // Step 2: For each Client, merge into Company (domain-keyed if domain exists, else name-keyed)
    // Process in batches of 100 to avoid large transactions
    const BATCH_SIZE = 100;
    let migrated = 0;
    let offset = 0;

    while (offset < stats.total) {
      const batchMigrated = await step.run(
        `migrate-batch-${offset}`,
        async () => {
          // Domain-keyed merge: Client nodes that have a domain
          await neo4jWrite(
            `MATCH (cl:Client)
             WHERE NOT cl:Company AND cl.domain IS NOT NULL AND cl.domain <> ""
             WITH cl LIMIT $limit
             MERGE (co:Company {domain: cl.domain})
             ON CREATE SET co.name = cl.name,
                           co.enrichmentStatus = "stub",
                           co.isCosCustomer = false,
                           co.source = "migrated_from_client",
                           co.createdAt = datetime()
             ON MATCH SET  co.name = coalesce(co.name, cl.name)
             // Repoint HAS_CLIENT edges
             WITH cl, co
             OPTIONAL MATCH (f:ServiceFirm)-[hc:HAS_CLIENT]->(cl)
             FOREACH (_ IN CASE WHEN f IS NOT NULL THEN [1] ELSE [] END |
               MERGE (f)-[:HAS_CLIENT]->(co)
             )
             // Repoint FOR_CLIENT edges
             WITH cl, co
             OPTIONAL MATCH (cs:CaseStudy)-[fc:FOR_CLIENT]->(cl)
             FOREACH (_ IN CASE WHEN cs IS NOT NULL THEN [1] ELSE [] END |
               MERGE (cs)-[:FOR_CLIENT]->(co)
             )
             SET cl.isLegacy = true
             RETURN count(cl) AS count`,
            { limit: BATCH_SIZE }
          );

          // Name-keyed merge: Client nodes without a domain
          const result = await neo4jWrite(
            `MATCH (cl:Client)
             WHERE NOT cl:Company AND (cl.domain IS NULL OR cl.domain = "")
             WITH cl LIMIT $limit
             MERGE (co:Company {name: cl.name})
             ON CREATE SET co.enrichmentStatus = "stub",
                           co.isCosCustomer = false,
                           co.source = "migrated_from_client",
                           co.createdAt = datetime()
             WITH cl, co
             OPTIONAL MATCH (f:ServiceFirm)-[hc:HAS_CLIENT]->(cl)
             FOREACH (_ IN CASE WHEN f IS NOT NULL THEN [1] ELSE [] END |
               MERGE (f)-[:HAS_CLIENT]->(co)
             )
             WITH cl, co
             OPTIONAL MATCH (cs:CaseStudy)-[fc:FOR_CLIENT]->(cl)
             FOREACH (_ IN CASE WHEN cs IS NOT NULL THEN [1] ELSE [] END |
               MERGE (cs)-[:FOR_CLIENT]->(co)
             )
             SET cl.isLegacy = true
             RETURN count(cl) AS count`,
            { limit: BATCH_SIZE }
          );

          return (result as { count: number }[])[0]?.count ?? 0;
        }
      );

      migrated += batchMigrated;
      offset += BATCH_SIZE;

      // Stop if the last batch returned nothing (all done)
      if (batchMigrated === 0) break;
    }

    // Step 3: Verify — count remaining un-migrated Client nodes
    const remaining = await step.run("verify", async () => {
      const result = await neo4jWrite(
        `MATCH (c:Client) WHERE NOT c:Company RETURN count(c) AS remaining`,
        {}
      );
      return (result as { remaining: number }[])[0]?.remaining ?? 0;
    });

    console.log(
      `[Migration] Client→Company: ${migrated} migrated, ${remaining} remaining`
    );

    return {
      message: "Migration complete",
      total: stats.total,
      migrated,
      remaining,
    };
  }
);
