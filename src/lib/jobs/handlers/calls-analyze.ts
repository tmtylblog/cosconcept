/**
 * Handler: calls-analyze
 * Post-call analysis: extract opportunities, coaching report, emails.
 */

import { extractOpportunities } from "@/lib/ai/opportunity-extractor";
import { analyzeCall } from "@/lib/ai/coaching-analyzer";
import { db } from "@/lib/db";
import {
  opportunities,
  coachingReports,
  callTranscripts,
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

async function findRecommendations(topics: string[]): Promise<{
  experts: { name: string; firm: string; reason: string; profileUrl?: string }[];
  caseStudies: { title: string; firm: string; relevance: string; url?: string }[];
}> {
  if (topics.length === 0) return { experts: [], caseStudies: [] };
  try {
    const topicList = topics.slice(0, 5);
    const expertResults = await neo4jRead<{ expertName: string; firmName: string; skill: string }>(
      `MATCH (p:Person)-[:HAS_SKILL]->(s:Skill)
       WHERE ANY(topic IN $topics WHERE toLower(s.name) CONTAINS toLower(topic))
       RETURN p.fullName AS expertName, p.firmId AS firmName, s.name AS skill
       LIMIT 6`,
      { topics: topicList }
    );
    const caseStudyResults = await neo4jRead<{ title: string; firmName: string; skill: string }>(
      `MATCH (cs:CaseStudy)-[:USES_SKILL]->(s:Skill)
       WHERE ANY(topic IN $topics WHERE toLower(s.name) CONTAINS toLower(topic))
       RETURN cs.title AS title, cs.firmName AS firmName, s.name AS skill
       LIMIT 4`,
      { topics: topicList }
    );
    return {
      experts: expertResults.map((r) => ({
        name: r.expertName,
        firm: r.firmName,
        reason: `Has expertise in ${r.skill} — relevant to ${topics[0]}`,
      })),
      caseStudies: caseStudyResults.map((r) => ({
        title: r.title,
        firm: r.firmName,
        relevance: `Uses ${r.skill} — related to your call topics`,
      })),
    };
  } catch (err) {
    console.warn("[CallsAnalyze] Neo4j recommendation query failed:", err);
    return { experts: [], caseStudies: [] };
  }
}

interface Payload {
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
  customPrompt?: string;
  clientDomain?: string;
  clientContext?: string;
}

export async function handleCallsAnalyze(
  payload: Record<string, unknown>
): Promise<unknown> {
  const {
    callId,
    firmId,
    userId,
    transcript,
    callType,
    duration,
    partnershipId,
    scheduledCallId,
    transcriptId,
    customPrompt,
    clientDomain,
    clientContext,
  } = payload as unknown as Payload;

  // Step 1: Extract opportunities
  const firm = await db.query.serviceFirms.findFirst({
    where: eq(serviceFirms.id, firmId),
    columns: { name: true, enrichmentData: true },
  });
  const firmCategories =
    (firm?.enrichmentData as { classification?: { categories?: string[] } } | null)
      ?.classification?.categories ?? [];
  // Load custom prompt from platform settings if not provided in payload
  let promptToUse = customPrompt;
  if (!promptToUse) {
    try {
      const { platformSettings } = await import("@/lib/db/schema");
      const setting = await db
        .select({ value: platformSettings.value })
        .from(platformSettings)
        .where(eq(platformSettings.key, "opportunity_extraction_prompt"))
        .limit(1);
      if (setting[0]?.value) {
        promptToUse = setting[0].value;
      }
    } catch {
      // Table may not exist yet — use default
    }
  }

  // Build transcript with client context prepended if available
  let textToAnalyze = transcript;
  if (clientContext) {
    textToAnalyze = `## CLIENT CONTEXT (from research)\n${clientContext}\n\n## TRANSCRIPT\n${transcript}`;
  } else if (clientDomain) {
    textToAnalyze = `## CLIENT CONTEXT\nClient domain: ${clientDomain} (no research data available yet)\n\n## TRANSCRIPT\n${transcript}`;
  }

  const extractedOpportunities = await extractOpportunities(textToAnalyze, {
    firmName: firm?.name,
    firmCategories,
    source: "call_transcript",
    customPrompt: promptToUse,
  });

  // Step 2: Coaching analysis
  const coaching = await analyzeCall(transcript, { callType });

  // Step 3: Create opportunity records
  let createdOpportunities = 0;
  const createdOppIds: string[] = [];
  for (const opp of extractedOpportunities) {
    if (opp.confidence < 0.6) continue;
    const oppId = generateId("opp");
    await db.insert(opportunities).values({
      id: oppId,
      firmId,
      createdBy: userId ?? firmId,
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
      clientSizeBand: (opp.clientSizeBand as "individual" | "micro_1_10" | "small_11_50" | "emerging_51_200" | "mid_201_500" | "upper_mid_501_1000" | "large_1001_5000" | "major_5001_10000" | "global_10000_plus" | null | undefined) ?? null,
      source: "call",
      sourceId: transcriptId ?? null,
      status: "new",
    });
    createdOppIds.push(oppId);
    createdOpportunities++;
  }

  // Step 3b: Auto-match opportunities to specialist profiles
  let matchResults: { opportunityId: string; totalExpertMatches: number; totalCaseStudyMatches: number }[] = [];
  if (createdOppIds.length > 0) {
    try {
      const { findOpportunityMatches } = await import("@/lib/matching/opportunity-matcher");
      const results = await findOpportunityMatches(createdOppIds, firmId, "both");
      matchResults = results.map((m) => ({
        opportunityId: m.opportunityId,
        totalExpertMatches: m.totalExpertMatches,
        totalCaseStudyMatches: m.totalCaseStudyMatches,
      }));
    } catch (err) {
      console.warn("[CallsAnalyze] Opportunity matching failed:", err);
    }
  }

  // Step 4: Recommendations via Neo4j
  const recommendations = await findRecommendations(coaching.topicsCovered);

  // Step 5: Store coaching report
  const reportId = generateId("rpt");
  await db.insert(coachingReports).values({
    id: reportId,
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

  if (transcriptId) {
    await db
      .update(callTranscripts)
      .set({ coachingReportId: reportId, processingStatus: "done" })
      .where(eq(callTranscripts.id, transcriptId));
  }

  // Step 6: Send coaching emails
  const callDate = new Date();
  const callDurationMinutes = duration ? Math.round(duration / 60) : undefined;

  const primaryFirm = await db.query.serviceFirms.findFirst({
    where: eq(serviceFirms.id, firmId),
    columns: { name: true },
  });
  const primaryContact = await getFirmOwnerEmail(firmId);

  if (primaryContact && primaryFirm) {
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

    await db
      .update(coachingReports)
      .set({ sentToFirmAAt: new Date() })
      .where(eq(coachingReports.id, reportId));

    // Two-party for partnership calls
    if (callType === "partnership" && partnershipId) {
      const partnership = await db.query.partnerships.findFirst({
        where: eq(partnerships.id, partnershipId),
      });
      if (partnership) {
        const partnerFirmId =
          partnership.firmAId === firmId ? partnership.firmBId : partnership.firmAId;
        const partnerFirm = await db.query.serviceFirms.findFirst({
          where: eq(serviceFirms.id, partnerFirmId),
          columns: { name: true, isPlatformMember: true },
        });
        if (partnerFirm?.isPlatformMember) {
          const partnerContact = await getFirmOwnerEmail(partnerFirmId);
          if (partnerContact) {
            const { subject: ps, html: ph, text: pt } = buildCoachingReportEmail({
              firmName: partnerFirm.name,
              callDate,
              callDurationMinutes,
              callType: "partnership",
              coaching,
              recommendedExperts: recommendations.experts,
              recommendedCaseStudies: recommendations.caseStudies,
              callId,
            });
            await sendEmail({ to: partnerContact.email, subject: ps, html: ph, text: pt,
              tags: [{ name: "type", value: "coaching_report" }, { name: "call_id", value: callId }] });
            await db.update(coachingReports).set({ sentToFirmBAt: new Date() }).where(eq(coachingReports.id, reportId));
          }
        }
      }
    }
  }

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
    opportunities: { detected: extractedOpportunities.length, created: createdOpportunities },
    recommendations: { experts: recommendations.experts.length, caseStudies: recommendations.caseStudies.length },
    matches: matchResults,
  };
}
