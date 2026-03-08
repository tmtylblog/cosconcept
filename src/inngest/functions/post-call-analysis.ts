/**
 * Post-Call Analysis Pipeline — Inngest Function
 *
 * Triggered when a call transcript is available (from Recall.ai webhook or manual upload).
 * Steps:
 *   1. Extract opportunities from transcript
 *   2. Run coaching analysis
 *   3. Create opportunity records for high-confidence detections
 *   4. Find relevant experts + case studies via Neo4j (based on topics discussed)
 *   5. Store coaching report
 *   6. Send coaching email(s) — two-party for partnership calls
 */

import { inngest } from "../client";
import { extractOpportunities } from "@/lib/ai/opportunity-extractor";
import { analyzeCall } from "@/lib/ai/coaching-analyzer";
import { db } from "@/lib/db";
import {
  opportunities,
  coachingReports,
  callTranscripts,
  scheduledCalls,
  partnerships,
  serviceFirms,
  members,
  users,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { neo4jRead } from "@/lib/neo4j";
import { sendEmail } from "@/lib/email/email-client";
import { buildCoachingReportEmail } from "@/lib/email/templates/coaching-report";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getFirmOwnerEmail(
  firmId: string
): Promise<{ email: string; name: string } | null> {
  try {
    const member = await db.query.members.findFirst({
      where: and(eq(members.organizationId, firmId), eq(members.role, "owner")),
    });
    if (!member) return null;
    const user = await db.query.users.findFirst({
      where: eq(users.id, member.userId),
      columns: { email: true, name: true },
    });
    return user ?? null;
  } catch {
    return null;
  }
}

// Query Neo4j for experts + case studies relevant to topics discussed
async function findRecommendations(topics: string[]): Promise<{
  experts: { name: string; firm: string; reason: string; profileUrl?: string }[];
  caseStudies: { title: string; firm: string; relevance: string; url?: string }[];
}> {
  if (topics.length === 0) return { experts: [], caseStudies: [] };

  try {
    const topicList = topics.slice(0, 5); // Limit to avoid huge queries

    // Find experts with skills matching discussed topics
    const expertResults = await neo4jRead<{
      expertName: string;
      firmName: string;
      skill: string;
    }>(
      `MATCH (e:Expert)-[:HAS_SKILL]->(s:Skill)
       WHERE ANY(topic IN $topics WHERE toLower(s.name) CONTAINS toLower(topic))
       RETURN e.name AS expertName, e.firmName AS firmName, s.name AS skill
       LIMIT 6`,
      { topics: topicList }
    );

    // Find case studies tagged with relevant skills/industries
    const caseStudyResults = await neo4jRead<{
      title: string;
      firmName: string;
      skill: string;
    }>(
      `MATCH (cs:CaseStudy)-[:USES_SKILL]->(s:Skill)
       WHERE ANY(topic IN $topics WHERE toLower(s.name) CONTAINS toLower(topic))
       RETURN cs.title AS title, cs.firmName AS firmName, s.name AS skill
       LIMIT 4`,
      { topics: topicList }
    );

    const experts = expertResults.map((r) => ({
      name: r.expertName,
      firm: r.firmName,
      reason: `Has expertise in ${r.skill} — relevant to ${topics[0]}`,
    }));

    const caseStudies = caseStudyResults.map((r) => ({
      title: r.title,
      firm: r.firmName,
      relevance: `Uses ${r.skill} — related to your call topics`,
    }));

    return { experts, caseStudies };
  } catch (err) {
    // Neo4j may not be seeded yet — fail gracefully
    console.warn("[PostCallAnalysis] Neo4j recommendation query failed:", err);
    return { experts: [], caseStudies: [] };
  }
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
      callType,
      participants,
      duration,
      partnershipId,
      scheduledCallId,
      transcriptId,
    } = event.data as {
      callId: string;
      firmId: string;
      userId?: string;
      transcript: string;
      callType: string;
      participants?: string[];
      duration?: number;
      partnershipId?: string;
      scheduledCallId?: string;
      transcriptId?: string;
    };

    // Step 1: Extract opportunities
    const extractedOpportunities = await step.run("extract-opportunities", async () => {
      console.log(`[PostCallAnalysis] Extracting opportunities from call ${callId}`);
      return extractOpportunities(transcript, { source: "call_transcript" });
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
            createdBy: userId ?? firmId,
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

    // Step 4: Find Neo4j-powered expert + case study recommendations
    const recommendations = await step.run("neo4j-recommendations", async () => {
      return findRecommendations(coaching.topicsCovered);
    });

    // Step 5: Store coaching report
    const reportId = await step.run("store-coaching-report", async () => {
      const rptId = generateId("rpt");
      await db.insert(coachingReports).values({
        id: rptId,
        callRecordingId: callId,
        scheduledCallId: scheduledCallId ?? null,
        talkingTimeRatio: coaching.talkingTimeRatio,
        valueProposition: coaching.valueProposition,
        questionQuality: coaching.questionQuality,
        topicsCovered: coaching.topicsCovered,
        nextSteps: coaching.nextSteps,
        actionItems: coaching.actionItems,
        overallScore: coaching.overallScore,
        topRecommendation: coaching.topRecommendation,
        recommendedExperts: recommendations.experts,
        recommendedCaseStudies: recommendations.caseStudies,
      });

      // Link transcript to report if we have a transcriptId
      if (transcriptId) {
        await db
          .update(callTranscripts)
          .set({ coachingReportId: rptId })
          .where(eq(callTranscripts.id, transcriptId));
      }

      return rptId;
    });

    // Step 6: Deliver coaching email(s)
    await step.run("deliver-coaching-emails", async () => {
      const callDate = new Date();
      const callDurationMinutes = duration ? Math.round(duration / 60) : undefined;

      // Get primary firm's contact
      const primaryFirm = await db.query.serviceFirms.findFirst({
        where: eq(serviceFirms.id, firmId),
        columns: { name: true },
      });
      const primaryContact = await getFirmOwnerEmail(firmId);

      if (!primaryContact || !primaryFirm) {
        console.warn(`[PostCallAnalysis] No contact found for firm ${firmId}`);
        return;
      }

      const { subject, html, text } = buildCoachingReportEmail({
        firmName: primaryFirm.name,
        callDate,
        callDurationMinutes,
        callType: callType as "partnership" | "client" | "unknown",
        coaching,
        recommendedExperts: recommendations.experts,
        recommendedCaseStudies: recommendations.caseStudies,
        callId,
      });

      // Send to primary firm
      await sendEmail({
        to: primaryContact.email,
        subject,
        html,
        text,
        tags: [
          { name: "type", value: "coaching_report" },
          { name: "call_id", value: callId },
        ],
      });

      // Update sentToFirmAAt
      await db
        .update(coachingReports)
        .set({ sentToFirmAAt: new Date() })
        .where(eq(coachingReports.id, reportId));

      // Two-party delivery for partnership calls
      if (callType === "partnership" && partnershipId) {
        const partnership = await db.query.partnerships.findFirst({
          where: eq(partnerships.id, partnershipId),
        });
        if (!partnership) return;

        const partnerFirmId =
          partnership.firmAId === firmId ? partnership.firmBId : partnership.firmAId;

        const partnerFirm = await db.query.serviceFirms.findFirst({
          where: eq(serviceFirms.id, partnerFirmId),
          columns: { name: true, isPlatformMember: true },
        });

        // Only send to partner if they're a platform member
        if (partnerFirm?.isPlatformMember) {
          const partnerContact = await getFirmOwnerEmail(partnerFirmId);
          if (partnerContact) {
            // Generate separate coaching report for the partner firm's perspective
            const {
              subject: partnerSubject,
              html: partnerHtml,
              text: partnerText,
            } = buildCoachingReportEmail({
              firmName: partnerFirm.name,
              callDate,
              callDurationMinutes,
              callType: "partnership",
              coaching, // Same analysis — they see their own perspective
              recommendedExperts: recommendations.experts,
              recommendedCaseStudies: recommendations.caseStudies,
              callId,
            });

            await sendEmail({
              to: partnerContact.email,
              subject: partnerSubject,
              html: partnerHtml,
              text: partnerText,
              tags: [
                { name: "type", value: "coaching_report" },
                { name: "call_id", value: callId },
                { name: "partner_firm", value: partnerFirmId },
              ],
            });

            await db
              .update(coachingReports)
              .set({ sentToFirmBAt: new Date() })
              .where(eq(coachingReports.id, reportId));
          }
        }
      }
    });

    return {
      callId,
      firmId,
      reportId,
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
      recommendations: {
        experts: recommendations.experts.length,
        caseStudies: recommendations.caseStudies.length,
      },
    };
  }
);
