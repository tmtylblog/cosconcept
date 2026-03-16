/**
 * Client Fit Assessment — scores how well a firm fits a prospect client.
 *
 * Algorithmic scoring across 6 dimensions, plus AI-generated talking points.
 * Uses the CompanyIntelligence data from client-research.ts for richer analysis.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import type { ClientResearchData } from "@/lib/enrichment/client-research";
import type { AbstractionProfile } from "./types";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Types ────────────────────────────────────────────────

interface DimensionScore {
  score: number; // 0-100
  evidence: string;
}

export interface FitAssessmentResult {
  overallScore: number;
  dimensions: {
    industryMatch: DimensionScore;
    stageSizeMatch: DimensionScore;
    skillRelevance: DimensionScore;
    caseStudyEvidence: DimensionScore;
    teamExperience: DimensionScore;
    competitiveAwareness: DimensionScore;
  };
  strengths: string[];
  gaps: string[];
  talkingPoints: string[];
}

interface FirmData {
  enrichmentData: Record<string, unknown>;
  abstraction: AbstractionProfile | null;
  caseStudies: { autoTags: Record<string, unknown> }[];
}

// ─── Scoring Functions ────────────────────────────────────

function scoreIndustryMatch(
  clientIndustries: string[],
  firmIndustries: string[],
  abstractionIndustries: string[]
): DimensionScore {
  const allFirmIndustries = [...new Set([...firmIndustries, ...abstractionIndustries])];
  if (allFirmIndustries.length === 0) {
    return { score: 20, evidence: "Firm has no classified industries" };
  }
  if (clientIndustries.length === 0) {
    return { score: 50, evidence: "Client industry unknown — moderate default" };
  }

  const matches = clientIndustries.filter((ci) =>
    allFirmIndustries.some((fi) => fi.toLowerCase().includes(ci.toLowerCase()) || ci.toLowerCase().includes(fi.toLowerCase()))
  );

  if (matches.length > 0) {
    return {
      score: Math.min(100, 60 + matches.length * 20),
      evidence: `Direct industry match: ${matches.join(", ")}`,
    };
  }

  return { score: 20, evidence: "No industry overlap found" };
}

function scoreStageSizeMatch(
  clientStage: string,
  clientEmployeeCount: number,
  typicalClientProfile: string
): DimensionScore {
  if (!clientStage && clientEmployeeCount === 0) {
    return { score: 50, evidence: "Client size/stage unknown" };
  }

  const clientBand = clientEmployeeCount > 1000 ? "enterprise" :
    clientEmployeeCount > 200 ? "mid-market" :
    clientEmployeeCount > 50 ? "smb" : "startup";

  const profileLower = typicalClientProfile.toLowerCase();
  const bandInProfile = profileLower.includes(clientBand) ||
    (clientBand === "enterprise" && profileLower.includes("large")) ||
    (clientBand === "startup" && (profileLower.includes("early") || profileLower.includes("small")));

  if (bandInProfile) {
    return { score: 90, evidence: `Firm typically works with ${clientBand} clients — good match` };
  }

  // Adjacent sizes
  const adjacent = (clientBand === "enterprise" && profileLower.includes("mid")) ||
    (clientBand === "mid-market" && (profileLower.includes("enterprise") || profileLower.includes("smb")));

  if (adjacent) {
    return { score: 60, evidence: `Client is ${clientBand}, firm typically works slightly different size` };
  }

  return { score: 30, evidence: `No evidence of working with ${clientBand} clients` };
}

function scoreSkillRelevance(
  clientOffering: string,
  clientBuyingIntent: string,
  firmSkills: string[],
  pitchContext?: string
): DimensionScore {
  const searchText = [clientOffering, clientBuyingIntent, pitchContext ?? ""]
    .join(" ")
    .toLowerCase();

  if (!searchText.trim()) {
    return { score: 40, evidence: "Insufficient data to assess skill relevance" };
  }

  const matchedSkills = firmSkills.filter((skill) =>
    searchText.includes(skill.toLowerCase()) ||
    skill.toLowerCase().split(" ").some((word) => word.length > 3 && searchText.includes(word))
  );

  if (matchedSkills.length >= 3) {
    return { score: 95, evidence: `Strong skill alignment: ${matchedSkills.slice(0, 5).join(", ")}` };
  }
  if (matchedSkills.length >= 1) {
    return { score: 65, evidence: `Some skill overlap: ${matchedSkills.join(", ")}` };
  }

  return { score: 25, evidence: "No direct skill overlap detected" };
}

function scoreCaseStudyEvidence(
  clientIndustries: string[],
  caseStudies: { autoTags: Record<string, unknown> }[]
): DimensionScore {
  if (caseStudies.length === 0) {
    return { score: 10, evidence: "No case studies available" };
  }

  let relevantCount = 0;
  for (const cs of caseStudies) {
    const csIndustries = (cs.autoTags?.industries as string[]) ?? [];
    const csSkills = (cs.autoTags?.skills as string[]) ?? [];
    const overlap = clientIndustries.some((ci) =>
      [...csIndustries, ...csSkills].some((tag) =>
        tag.toLowerCase().includes(ci.toLowerCase()) || ci.toLowerCase().includes(tag.toLowerCase())
      )
    );
    if (overlap) relevantCount++;
  }

  if (relevantCount >= 3) return { score: 100, evidence: `${relevantCount} relevant case studies found` };
  if (relevantCount === 2) return { score: 75, evidence: "2 relevant case studies found" };
  if (relevantCount === 1) return { score: 50, evidence: "1 relevant case study found" };
  return { score: 15, evidence: `${caseStudies.length} case studies, but none in client's industry` };
}

function scoreTeamExperience(
  clientName: string,
  clientCompetitors: string,
  clientIndustry: string
): DimensionScore {
  // This is a simplified version — full implementation would query expert_profiles
  // For now, return a neutral score since we can't query experts from this module
  // without adding a DB dependency. The tool layer will enrich this.
  if (!clientName && !clientIndustry) {
    return { score: 30, evidence: "Insufficient data for team experience assessment" };
  }
  return { score: 50, evidence: "Team experience check requires expert profile lookup — moderate default" };
}

function scoreCompetitiveAwareness(
  clientCompetitors: string,
  firmIndustries: string[]
): DimensionScore {
  if (!clientCompetitors) {
    return { score: 50, evidence: "No competitor data available" };
  }

  const competitorLower = clientCompetitors.toLowerCase();
  const industryOverlap = firmIndustries.some((ind) =>
    competitorLower.includes(ind.toLowerCase())
  );

  if (industryOverlap) {
    return { score: 80, evidence: "Firm has expertise in the client's competitive landscape" };
  }
  return { score: 30, evidence: "Limited overlap with client's competitive landscape" };
}

// ─── Talking Points Generation ────────────────────────────

async function generateTalkingPoints(
  client: ClientResearchData,
  firm: FirmData,
  dimensions: FitAssessmentResult["dimensions"],
  gaps: string[]
): Promise<string[]> {
  try {
    const firmClassification = firm.enrichmentData?.classification as Record<string, unknown> | undefined;
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Generate 3-5 pitch talking points for a professional services firm pitching to a prospect client.

## CLIENT: ${client.name}
Executive Summary: ${client.intelligence.executiveSummary}
Buying Intent: ${client.intelligence.buyingIntentInsight}
Growth Challenges: ${client.intelligence.growthChallenges}
Customer Insight: ${client.intelligence.customerInsight}
Stage: ${client.intelligence.stageInsight}

## FIRM CAPABILITIES
Industries: ${(firmClassification?.industries as string[])?.join(", ") ?? "N/A"}
Skills: ${(firmClassification?.skills as string[])?.join(", ") ?? "N/A"}
Services: ${firm.abstraction?.topServices?.join(", ") ?? "N/A"}
Case Studies: ${firm.caseStudies.length} available

## FIT ASSESSMENT
Industry Match: ${dimensions.industryMatch.score}/100 — ${dimensions.industryMatch.evidence}
Skill Relevance: ${dimensions.skillRelevance.score}/100 — ${dimensions.skillRelevance.evidence}
Case Study Evidence: ${dimensions.caseStudyEvidence.score}/100 — ${dimensions.caseStudyEvidence.evidence}
${gaps.length > 0 ? `Gaps: ${gaps.join(", ")}` : "No significant gaps"}

## INSTRUCTIONS
Generate 3-5 specific, actionable talking points. Each should:
- Reference something specific about the client (not generic advice)
- Connect the firm's capabilities to the client's actual needs or challenges
- Be one sentence, direct, ready to use in a pitch meeting`,
      schema: z.object({
        talkingPoints: z.array(z.string()).describe("3-5 specific pitch talking points"),
      }),
      maxOutputTokens: 512,
    });
    return result.object.talkingPoints;
  } catch (err) {
    console.error("[FitAssessment] Talking points generation failed:", err);
    return ["Lead with case studies in the client's industry", "Highlight relevant team experience"];
  }
}

// ─── Main Assessment Function ─────────────────────────────

export async function assessClientFit(params: {
  clientData: ClientResearchData;
  firmEnrichmentData: Record<string, unknown>;
  firmAbstraction: AbstractionProfile | null;
  firmCaseStudies: { autoTags: Record<string, unknown> }[];
  pitchContext?: string;
}): Promise<FitAssessmentResult> {
  const { clientData, firmEnrichmentData, firmAbstraction, firmCaseStudies, pitchContext } = params;

  const firmClassification = firmEnrichmentData?.classification as Record<string, unknown> | undefined;
  const firmIndustries = (firmClassification?.industries as string[]) ?? [];
  const firmSkills = [
    ...((firmClassification?.skills as string[]) ?? []),
    ...(firmAbstraction?.topSkills ?? []),
  ];
  const allFirmIndustries = [
    ...firmIndustries,
    ...(firmAbstraction?.topIndustries ?? []),
  ];

  const clientIndustries = clientData.classification.industries.length > 0
    ? clientData.classification.industries
    : clientData.industry ? [clientData.industry] : [];

  // Score each dimension
  const dimensions = {
    industryMatch: scoreIndustryMatch(clientIndustries, firmIndustries, firmAbstraction?.topIndustries ?? []),
    stageSizeMatch: scoreStageSizeMatch(
      clientData.intelligence.stageInsight,
      clientData.employeeCount,
      firmAbstraction?.typicalClientProfile ?? ""
    ),
    skillRelevance: scoreSkillRelevance(
      clientData.intelligence.offeringSummary,
      clientData.intelligence.buyingIntentInsight,
      firmSkills,
      pitchContext
    ),
    caseStudyEvidence: scoreCaseStudyEvidence(clientIndustries, firmCaseStudies),
    teamExperience: scoreTeamExperience(
      clientData.name,
      clientData.intelligence.competitorsInsight,
      clientData.industry
    ),
    competitiveAwareness: scoreCompetitiveAwareness(
      clientData.intelligence.competitorsInsight,
      allFirmIndustries
    ),
  };

  // Weighted average
  const overallScore = Math.round(
    dimensions.industryMatch.score * 0.25 +
    dimensions.stageSizeMatch.score * 0.15 +
    dimensions.skillRelevance.score * 0.25 +
    dimensions.caseStudyEvidence.score * 0.20 +
    dimensions.teamExperience.score * 0.10 +
    dimensions.competitiveAwareness.score * 0.05
  );

  const strengths = Object.entries(dimensions)
    .filter(([, d]) => d.score >= 70)
    .map(([key, d]) => `${key}: ${d.evidence}`);

  const gaps = Object.entries(dimensions)
    .filter(([, d]) => d.score < 40)
    .map(([key, d]) => `${key}: ${d.evidence}`);

  // Generate AI talking points
  const firmData: FirmData = {
    enrichmentData: firmEnrichmentData,
    abstraction: firmAbstraction,
    caseStudies: firmCaseStudies,
  };
  const talkingPoints = await generateTalkingPoints(clientData, firmData, dimensions, gaps);

  return {
    overallScore,
    dimensions,
    strengths,
    gaps,
    talkingPoints,
  };
}
