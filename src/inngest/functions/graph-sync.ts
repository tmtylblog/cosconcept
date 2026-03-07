/**
 * Inngest Function: Graph Sync
 *
 * Syncs a firm's enrichment data to Neo4j.
 * Called after enrichment completes or when data is updated.
 */

import { inngest } from "../client";
import { writeFirmToGraph } from "@/lib/enrichment/graph-writer";

export const graphSyncFirm = inngest.createFunction(
  {
    id: "graph-sync-firm",
    name: "Sync Firm to Graph",
    retries: 3,
  },
  { event: "graph/sync-firm" },
  async ({ event, step }) => {
    const { firmId, organizationId, firmName, website } = event.data;

    const result = await step.run("write-to-graph", async () => {
      return writeFirmToGraph({
        firmId,
        organizationId,
        name: firmName,
        website,
      });
    });

    return { firmId, result };
  }
);
