/**
 * Inngest Function: Team Roster Import
 *
 * Pulls employee roster from PDL, classifies into expert tiers,
 * writes to Neo4j as Person stubs, and auto-enriches top experts.
 *
 * Reuses the existing handler logic from lib/jobs/handlers/team-ingest.ts
 * but wraps it in Inngest's durable execution model.
 */

import { inngest } from "../client";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { backgroundJobs } from "@/lib/db/schema";
import { handleTeamIngest } from "@/lib/jobs/handlers/team-ingest";

export const teamIngest = inngest.createFunction(
  {
    id: "enrich-team-ingest",
    name: "Team Roster Import",
    retries: 2,
    concurrency: [{ limit: 3 }], // Avoid hammering PDL API
  },
  { event: "enrich/team-ingest" },
  async ({ event, step }) => {
    const { firmId, domain, limit, autoEnrichLimit, force, jobId, companyName } = event.data;

    // Update the tracking row to "running"
    await step.run("mark-running", async () => {
      await db
        .update(backgroundJobs)
        .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(backgroundJobs.id, jobId));
    });

    // Run the actual team-ingest handler
    const result = await step.run("team-ingest", async () => {
      return handleTeamIngest({
        firmId,
        domain,
        limit,
        autoEnrichLimit,
        companyName,
        force,
      });
    });

    // Mark done in the tracking table
    await step.run("mark-done", async () => {
      await db
        .update(backgroundJobs)
        .set({
          status: "done",
          completedAt: new Date(),
          result: (result ?? null) as Record<string, unknown> | null,
          updatedAt: new Date(),
        })
        .where(eq(backgroundJobs.id, jobId));
    });

    return result;
  }
);
