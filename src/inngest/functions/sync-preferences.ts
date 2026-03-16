/**
 * Inngest: preferences/sync-graph — Sync Preferences to Neo4j
 *
 * Syncs preference data to the Neo4j knowledge graph as a background job.
 * Supports syncing all preferences or a single field.
 */

import { inngest } from "../client";
import {
  syncAllPreferencesToGraph,
  syncPreferenceFieldToGraph,
} from "@/lib/enrichment/preference-writer";

export const syncPreferences = inngest.createFunction(
  {
    id: "sync-preferences",
    concurrency: [{ limit: 5 }],
    retries: 2,
  },
  { event: "preferences/sync-graph" },
  async ({ event, step }) => {
    const { firmId, field, value } = event.data;

    const result = await step.run("sync", async () => {
      if (field && value !== undefined) {
        await syncPreferenceFieldToGraph(firmId, field, value);
        return { mode: "single-field", field };
      } else {
        const r = await syncAllPreferencesToGraph(firmId);
        return {
          mode: "full-sync",
          prefersWritten: r.prefersWritten,
          propertiesSet: r.propertiesSet,
          errors: r.errors,
        };
      }
    });

    return { status: "completed", ...result };
  }
);
