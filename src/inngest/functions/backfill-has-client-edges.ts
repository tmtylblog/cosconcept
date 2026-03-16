/**
 * One-time Migration: Backfill HAS_CLIENT edges + sync case study clients to firm profiles.
 *
 * Two operations:
 * 1. Graph backfill: For all existing CaseStudy-[:FOR_CLIENT]->Company relationships,
 *    create the corresponding ServiceFirm-[:HAS_CLIENT]->Company edge if missing.
 * 2. PG sync: For each firm, collect client names from firmCaseStudies.autoTags.clientName
 *    and merge them into serviceFirms.enrichmentData.extracted.clients so they show
 *    on the firm overview page.
 *
 * Safe to run multiple times (idempotent — uses MERGE).
 *
 * Trigger: Send event "migration/backfill-has-client" with empty data.
 */

import { inngest } from "../client";
import { neo4jWrite } from "@/lib/neo4j";
import { db } from "@/lib/db";
import { firmCaseStudies, serviceFirms } from "@/lib/db/schema";
import { eq, ne, isNotNull, sql } from "drizzle-orm";

export const backfillHasClientEdges = inngest.createFunction(
  {
    id: "migration-backfill-has-client-edges",
    name: "Migration: Backfill HAS_CLIENT Edges",
    retries: 1,
    concurrency: [{ limit: 1 }],
  },
  { event: "migration/backfill-has-client" },
  async ({ step }) => {
    // Step 1: Global graph backfill — create HAS_CLIENT edges from existing FOR_CLIENT
    const graphResult = await step.run("backfill-graph-edges", async () => {
      const result = await neo4jWrite(
        `MATCH (f:Company:ServiceFirm)-[:HAS_CASE_STUDY]->(cs:CaseStudy)-[:FOR_CLIENT]->(c:Company)
         WHERE NOT (f)-[:HAS_CLIENT]->(c)
         MERGE (f)-[r:HAS_CLIENT]->(c)
         SET r.source = "backfill_from_case_studies"
         RETURN count(r) AS edgesCreated`,
        {}
      );
      const edgesCreated = (result as { edgesCreated: number }[])[0]?.edgesCreated ?? 0;
      console.warn(`[Backfill] Created ${edgesCreated} HAS_CLIENT edges from case study data`);
      return { edgesCreated };
    });

    // Step 2: For each firm, sync case study client names into enrichmentData.extracted.clients
    const firmSyncResult = await step.run("sync-clients-to-firm-profiles", async () => {
      // Get all distinct firmIds that have case studies with client names
      const firmsWithClients = await db
        .selectDistinct({ firmId: firmCaseStudies.firmId })
        .from(firmCaseStudies)
        .where(
          ne(firmCaseStudies.status, "deleted")
        );

      let firmsUpdated = 0;
      let totalClientsAdded = 0;

      for (const { firmId } of firmsWithClients) {
        // Get all client names from this firm's case studies
        const caseStudies = await db
          .select({
            autoTags: firmCaseStudies.autoTags,
          })
          .from(firmCaseStudies)
          .where(eq(firmCaseStudies.firmId, firmId));

        const clientNames = new Set<string>();
        for (const cs of caseStudies) {
          const tags = cs.autoTags as { clientName?: string } | null;
          if (tags?.clientName) {
            clientNames.add(tags.clientName);
          }
        }

        if (clientNames.size === 0) continue;

        // Load current enrichmentData
        const [firm] = await db
          .select({ enrichmentData: serviceFirms.enrichmentData })
          .from(serviceFirms)
          .where(eq(serviceFirms.id, firmId))
          .limit(1);

        if (!firm) continue;

        const enrichment = (firm.enrichmentData as Record<string, unknown>) ?? {};
        const extracted = (enrichment.extracted as Record<string, unknown>) ?? {};
        const existingClients = (extracted.clients as string[]) ?? [];

        // Merge — add new client names that aren't already in the list
        const existingSet = new Set(existingClients.map((c) => c.toLowerCase()));
        const newClients: string[] = [];
        for (const name of clientNames) {
          if (!existingSet.has(name.toLowerCase())) {
            newClients.push(name);
          }
        }

        if (newClients.length === 0) continue;

        const mergedClients = [...existingClients, ...newClients];
        const updatedExtracted = { ...extracted, clients: mergedClients };
        const updatedEnrichment = { ...enrichment, extracted: updatedExtracted };

        await db
          .update(serviceFirms)
          .set({ enrichmentData: updatedEnrichment })
          .where(eq(serviceFirms.id, firmId));

        // Also write to Neo4j graph
        await neo4jWrite(
          `MATCH (f:Company {id: $firmId})
           UNWIND $names AS clientName
           MERGE (c:Company {name: clientName})
           ON CREATE SET c.enrichmentStatus = "stub",
                         c.isCosCustomer = false,
                         c.source = "case_study_backfill",
                         c.createdAt = datetime()
           MERGE (f)-[r:HAS_CLIENT]->(c)
           SET r.source = "case_study_backfill"`,
          { firmId, names: newClients }
        );

        firmsUpdated++;
        totalClientsAdded += newClients.length;
        console.warn(`[Backfill] Firm ${firmId}: added ${newClients.length} clients (total now: ${mergedClients.length})`);
      }

      return { firmsUpdated, totalClientsAdded };
    });

    return {
      status: "completed",
      graphEdgesCreated: graphResult.edgesCreated,
      firmsUpdated: firmSyncResult.firmsUpdated,
      totalClientsAdded: firmSyncResult.totalClientsAdded,
    };
  }
);
