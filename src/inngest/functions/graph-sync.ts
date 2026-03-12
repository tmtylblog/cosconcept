/**
 * Inngest Function: Graph Sync
 *
 * Syncs a firm's enrichment data to Neo4j.
 * Called after enrichment completes or when data is updated.
 */

import { inngest } from "../client";
import { writeFirmToGraph } from "@/lib/enrichment/graph-writer";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PdlCompany } from "@/lib/enrichment/pdl";
import type { FirmGroundTruth } from "@/lib/enrichment/jina-scraper";
import type { FirmClassification } from "@/lib/enrichment/ai-classifier";

export const graphSyncFirm = inngest.createFunction(
  {
    id: "graph-sync-firm",
    name: "Sync Firm to Graph",
    retries: 3,
  },
  { event: "graph/sync-firm" },
  async ({ event, step }) => {
    const { firmId, organizationId, firmName, website } = event.data;

    // Load full enrichment data from PostgreSQL
    const firmRow = await step.run("fetch-enrichment-data", async () => {
      const rows = await db
        .select({
          name: serviceFirms.name,
          website: serviceFirms.website,
          enrichmentData: serviceFirms.enrichmentData,
        })
        .from(serviceFirms)
        .where(eq(serviceFirms.id, firmId))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!firmRow) {
      return { firmId, result: null, error: "Firm not found in PostgreSQL" };
    }

    const result = await step.run("write-to-graph", async () => {
      const ed = firmRow.enrichmentData as Record<string, unknown> | null;

      // Map enrichmentData shape to what writeFirmToGraph expects
      const pdl = (ed?.companyData ?? null) as PdlCompany | null;
      const groundTruth = ed?.extracted
        ? ({ extracted: ed.extracted } as Pick<FirmGroundTruth, "extracted">)
        : null;
      const classification = (ed?.classification ?? null) as FirmClassification | null;

      return writeFirmToGraph({
        firmId,
        organizationId,
        name: firmRow.name ?? firmName,
        website: firmRow.website ?? website,
        pdl,
        groundTruth: groundTruth as FirmGroundTruth | null,
        classification,
      });
    });

    return { firmId, result };
  }
);
