/**
 * Inngest: opportunities/extract — Opportunity Extraction from Transcripts
 *
 * Runs AI opportunity extraction as a background job to avoid timeout.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { opportunities } from "@/lib/db/schema";
import { extractOpportunities } from "@/lib/ai/opportunity-extractor";

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const extractOpportunitiesJob = inngest.createFunction(
  {
    id: "extract-opportunities",
    concurrency: [{ limit: 5 }],
    retries: 2,
  },
  { event: "opportunities/extract" },
  async ({ event, step }) => {
    const { transcript, firmId, userId, firmName, firmCategories, source } = event.data;

    // Step 1: Extract opportunities via AI
    const extracted = await step.run("extract", async () => {
      return await extractOpportunities(transcript, {
        firmName: firmName ?? undefined,
        firmCategories: firmCategories?.length ? firmCategories : undefined,
        source,
      });
    });

    // Step 2: Persist to DB
    const insertedCount = await step.run("persist", async () => {
      let count = 0;
      for (const opp of extracted) {
        const oppId = uid("opp");
        await db.insert(opportunities).values({
          id: oppId,
          firmId,
          createdBy: userId,
          title: opp.title,
          description: opp.description,
          evidence: opp.evidence ?? null,
          signalType: opp.signalType ?? "direct",
          priority: opp.priority ?? "medium",
          resolutionApproach: opp.resolutionApproach ?? "network",
          requiredCategories: opp.requiredCategories ?? [],
          requiredSkills: opp.requiredSkills ?? [],
          requiredIndustries: opp.requiredIndustries ?? [],
          requiredMarkets: opp.requiredMarkets ?? [],
          estimatedValue: opp.estimatedValue ?? null,
          timeline: opp.timeline ?? null,
          clientName: opp.clientName ?? null,
          clientSizeBand: (opp.clientSizeBand ?? null) as "individual" | "micro_1_10" | "small_11_50" | "emerging_51_200" | "mid_201_500" | "upper_mid_501_1000" | "large_1001_5000" | "major_5001_10000" | "global_10000_plus" | null,
          source,
          status: "new",
        });
        count++;
      }
      return count;
    });

    return { status: "completed", opportunitiesExtracted: insertedCount };
  }
);
