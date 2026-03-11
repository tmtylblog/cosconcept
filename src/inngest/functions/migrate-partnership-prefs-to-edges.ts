/**
 * One-time Migration: Convert legacy Postgres preference arrays → Neo4j PREFERS edges.
 *
 * Firms that onboarded before the preference-writer existed have their preferences
 * stored only in partner_preferences.preferred_* Postgres columns. This job
 * reads those legacy columns and calls syncAllPreferencesToGraph() for each firm,
 * which writes PREFERS edges and sets preferencesSyncedAt.
 *
 * Also handles firms with rawOnboardingData that were never synced to the graph
 * (preferencesSyncedAt IS NULL).
 *
 * Idempotent — only processes firms where preferencesSyncedAt IS NULL.
 * Triggered manually: inngest.send({ name: "migration/partnership-prefs-to-edges" })
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { partnerPreferences } from "@/lib/db/schema";
import { syncAllPreferencesToGraph } from "@/lib/enrichment/preference-writer";
import { isNull } from "drizzle-orm";

export const migratePartnershipPrefsToEdges = inngest.createFunction(
  {
    id: "migration-partnership-prefs-to-edges",
    name: "Migration: Partnership Prefs → Neo4j PREFERS Edges",
    retries: 2,
    concurrency: { limit: 1 },
  },
  { event: "migration/partnership-prefs-to-edges" },
  async ({ step }) => {
    // Step 1: Find all firms with unsynced preferences
    const unsyncedFirmIds = await step.run(
      "find-unsynced-firms",
      async () => {
        const rows = await db
          .select({ firmId: partnerPreferences.firmId })
          .from(partnerPreferences)
          .where(isNull(partnerPreferences.preferencesSyncedAt));

        return rows.map((r) => r.firmId);
      }
    );

    if (unsyncedFirmIds.length === 0) {
      return { message: "All firm preferences already synced", synced: 0 };
    }

    // Step 2: Sync each firm's preferences to Neo4j PREFERS edges
    // Sequential with light pacing to avoid overwhelming Neo4j
    let synced = 0;
    let errors = 0;

    for (const firmId of unsyncedFirmIds) {
      const result = await step.run(`sync-firm-${firmId}`, async () => {
        try {
          return await syncAllPreferencesToGraph(firmId);
        } catch (err) {
          console.error(
            `[Migration] Failed to sync preferences for firm ${firmId}:`,
            err
          );
          return { firmId, prefersWritten: 0, propertiesSet: [], errors: [String(err)] };
        }
      });

      if (result.errors.length === 0) {
        synced++;
      } else {
        errors++;
        console.warn(
          `[Migration] Preference sync errors for ${firmId}:`,
          result.errors
        );
      }
    }

    console.log(
      `[Migration] Partnership prefs → edges: ${synced} synced, ${errors} errors out of ${unsyncedFirmIds.length} firms`
    );

    return {
      message: "Migration complete",
      total: unsyncedFirmIds.length,
      synced,
      errors,
    };
  }
);
