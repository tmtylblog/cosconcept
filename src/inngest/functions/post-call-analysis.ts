/**
 * Inngest Function: Post-Call Analysis Pipeline
 *
 * Triggered when a call transcript is submitted (from Chrome extension
 * or manual upload). Performs:
 *
 * 1. Store call record in database
 * 2. Extract opportunities from transcript
 * 3. Run coaching analysis
 * 4. Extract action items
 * 5. Find relevant partner recommendations
 * 6. Create opportunity records if detected
 */

import { inngest } from "../client";
import { extractOpportunities } from "@/lib/ai/opportunity-extractor";
import { analyzeCall } from "@/lib/ai/coaching-analyzer";
import { db } from "@/lib/db";
import { opportunities } from "@/lib/db/schema";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const postCallAnalysis = inngest.createFunction(
  {
    id: "calls-analyze",
    name: "Post-Call Analysis",
    retries: 1,
    concurrency: [{ limit: 5 }],
  },
  { event: "calls/analyze" },
  async ({ event, step }) => {
    const {
      callId,
      firmId,
      userId,
      transcript,
      platform,
      duration,
      participants,
      callType,
    } = event.data;

    // Step 1: Extract opportunities
    const extractedOpportunities = await step.run("extract-opportunities", async () => {
      console.log(`[PostCallAnalysis] Extracting opportunities from call ${callId}`);
      return extractOpportunities(transcript, {
        source: "call_transcript",
      });
    });

    // Step 2: Run coaching analysis
    const coaching = await step.run("coaching-analysis", async () => {
      console.log(`[PostCallAnalysis] Running coaching analysis for call ${callId}`);
      return analyzeCall(transcript, { callType });
    });

    // Step 3: Create opportunity records for high-confidence detections
    let createdOpportunities = 0;
    if (extractedOpportunities.length > 0) {
      await step.run("create-opportunities", async () => {
        for (const opp of extractedOpportunities) {
          if (opp.confidence < 0.6) continue;

          const oppId = generateId("opp");
          await db.insert(opportunities).values({
            id: oppId,
            firmId,
            createdBy: userId,
            title: opp.title,
            description: opp.description,
            requiredSkills: opp.requiredSkills,
            requiredIndustries: opp.requiredIndustries,
            estimatedValue: opp.estimatedValue ?? null,
            timeline: opp.timeline ?? null,
            clientType: opp.clientType ?? null,
            source: "call",
            status: "open",
          });
          createdOpportunities++;
        }
        return { created: createdOpportunities };
      });
    }

    return {
      callId,
      firmId,
      platform,
      duration,
      participants,
      analysis: {
        overallScore: coaching.overallScore,
        topRecommendation: coaching.topRecommendation,
        topicsCovered: coaching.topicsCovered,
        actionItems: coaching.actionItems.length,
        nextStepsEstablished: coaching.nextSteps.established,
      },
      opportunities: {
        detected: extractedOpportunities.length,
        created: createdOpportunities,
      },
      partnerRecommendations: coaching.partnerRecommendations,
    };
  }
);
