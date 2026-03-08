/**
 * Case Study Analyzer — Proprietary analysis pipeline.
 *
 * Takes raw CaseStudyCosAnalysis (from the ingestor) and produces:
 *
 * 1. VISIBLE LAYER (shown to users):
 *    - 2-sentence summary
 *    - Auto-generated tags (skills, industries, services, clientName)
 *
 * 2. HIDDEN LAYER (powers matching — stored in abstractionProfiles):
 *    - Capability proof — what this proves the firm can deliver
 *    - Partnership signals — what partner type would complement this work
 *    - Ideal referral profile — what incoming opportunity this evidences
 *    - Taxonomy mapping — normalized L2 skills + industries
 *    - Evidence strength — weak/moderate/strong with reasoning
 *
 * Cost: ~$0.001 per case study (2 Gemini Flash calls)
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject, generateText } from "ai";
import { z } from "zod/v4";
import { logUsage } from "@/lib/ai/gateway";
import type { CaseStudyCosAnalysis } from "./case-study-ingestor";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const FLASH_MODEL = "google/gemini-2.0-flash-001";

// ─── Types ──────────────────────────────────────────────────

export interface CaseStudyVisibleLayer {
  summary: string;
  autoTags: {
    skills: string[];
    industries: string[];
    services: string[];
    clientName: string | null;
  };
}

export interface CaseStudyAbstraction {
  capabilityProof: string;
  partnershipSignals: string;
  idealReferralProfile: string;
  taxonomyMapping: {
    normalizedSkills: string[];
    normalizedIndustries: string[];
  };
  evidenceStrength: "weak" | "moderate" | "strong";
  evidenceReasoning: string;
}

// ─── Visible Layer: Summary + Tags ──────────────────────────

/**
 * Generate the user-visible summary and auto-tags from AI-extracted analysis.
 *
 * Summary: 2 sentences. Sentence 1 = what was done for whom.
 * Sentence 2 = key outcome or result.
 *
 * Tags: Direct mapping from analysis fields — no extra AI call needed.
 */
export async function generateCaseStudySummary(
  analysis: CaseStudyCosAnalysis,
  options?: { organizationId?: string; entityId?: string }
): Promise<CaseStudyVisibleLayer> {
  const start = Date.now();

  // Build a concise prompt to generate the 2-sentence summary
  const contextParts: string[] = [];
  contextParts.push(`Title: ${analysis.title}`);
  if (analysis.clientName) contextParts.push(`Client: ${analysis.clientName}`);
  if (analysis.clientIndustry) contextParts.push(`Industry: ${analysis.clientIndustry}`);
  if (analysis.challenge) contextParts.push(`Challenge: ${analysis.challenge}`);
  if (analysis.solution) contextParts.push(`Solution: ${analysis.solution}`);
  if (analysis.outcomes.length > 0) contextParts.push(`Outcomes: ${analysis.outcomes.join("; ")}`);
  if (analysis.metrics.length > 0) {
    const metricStr = analysis.metrics
      .map((m) => `${m.label}: ${m.value}${m.improvement ? ` (${m.improvement})` : ""}`)
      .join("; ");
    contextParts.push(`Metrics: ${metricStr}`);
  }
  if (analysis.servicesUsed.length > 0) contextParts.push(`Services: ${analysis.servicesUsed.join(", ")}`);

  const result = await generateText({
    model: openrouter.chat(FLASH_MODEL),
    prompt: `Write exactly 2 sentences summarizing this case study. Sentence 1: what was done and for whom. Sentence 2: the key outcome or result. Be specific, not generic. No fluff.

${contextParts.join("\n")}

Reply with ONLY the 2 sentences, nothing else.`,
    maxOutputTokens: 200,
  });

  const durationMs = Date.now() - start;
  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;

  await logUsage({
    organizationId: options?.organizationId,
    model: FLASH_MODEL,
    feature: "case_study",
    inputTokens,
    outputTokens,
    entityType: "case_study",
    entityId: options?.entityId,
    durationMs,
  });

  // Tags: direct mapping from analysis — no AI call needed
  const autoTags = {
    skills: analysis.skillsDemonstrated.slice(0, 10),
    industries: analysis.industries.slice(0, 5),
    services: analysis.servicesUsed.slice(0, 8),
    clientName: analysis.clientName ?? null,
  };

  return {
    summary: result.text.trim(),
    autoTags,
  };
}

// ─── Hidden Layer: Abstraction Profile ──────────────────────

/**
 * Generate the proprietary hidden abstraction layer for a case study.
 *
 * This is what makes COS matching special — it interprets what a case study
 * MEANS for partnership matching, not just what it contains.
 *
 * Stored in abstractionProfiles (entityType = "case_study").
 */
export async function generateCaseStudyAbstraction(
  analysis: CaseStudyCosAnalysis,
  firmContext?: {
    firmName?: string;
    firmCategory?: string;
    firmServices?: string[];
  },
  options?: { organizationId?: string; entityId?: string }
): Promise<CaseStudyAbstraction> {
  const start = Date.now();

  // Build rich context for the abstraction model
  const contextParts: string[] = [];
  contextParts.push(`Case Study Title: ${analysis.title}`);
  if (analysis.clientName) contextParts.push(`Client: ${analysis.clientName}`);
  if (analysis.clientIndustry) contextParts.push(`Client Industry: ${analysis.clientIndustry}`);
  if (analysis.challenge) contextParts.push(`Challenge: ${analysis.challenge}`);
  if (analysis.solution) contextParts.push(`Solution: ${analysis.solution}`);
  if (analysis.approach) contextParts.push(`Approach: ${analysis.approach}`);
  if (analysis.outcomes.length > 0) contextParts.push(`Outcomes: ${analysis.outcomes.join("; ")}`);
  if (analysis.metrics.length > 0) {
    const metricStr = analysis.metrics
      .map((m) => `${m.label}: ${m.value}${m.improvement ? ` (${m.improvement})` : ""}`)
      .join("; ");
    contextParts.push(`Metrics: ${metricStr}`);
  }
  contextParts.push(`Services Used: ${analysis.servicesUsed.join(", ") || "not specified"}`);
  contextParts.push(`Skills Demonstrated: ${analysis.skillsDemonstrated.join(", ") || "not specified"}`);
  contextParts.push(`Industries: ${analysis.industries.join(", ") || "not specified"}`);
  if (analysis.projectDuration) contextParts.push(`Duration: ${analysis.projectDuration}`);
  if (analysis.teamSize) contextParts.push(`Team Size: ${analysis.teamSize}`);

  if (firmContext) {
    contextParts.push("");
    contextParts.push("--- Firm Context ---");
    if (firmContext.firmName) contextParts.push(`Firm Name: ${firmContext.firmName}`);
    if (firmContext.firmCategory) contextParts.push(`Firm Category: ${firmContext.firmCategory}`);
    if (firmContext.firmServices?.length) contextParts.push(`Firm Services: ${firmContext.firmServices.join(", ")}`);
  }

  const result = await generateObject({
    model: openrouter.chat(FLASH_MODEL),
    prompt: `You are analyzing a professional services case study to extract PARTNERSHIP MATCHING signals. This is for a platform that connects complementary firms for partnerships.

CASE STUDY DATA:
${contextParts.join("\n")}

Analyze this case study and produce:

1. **capabilityProof**: What does this case study PROVE this firm can deliver? Be evidence-based. Example: "Proven ability to deliver end-to-end Shopify Plus migrations for mid-market DTC brands, with measurable revenue impact."

2. **partnershipSignals**: What types of firms would COMPLEMENT this work? Think about who they'd need as partners or who'd refer work to them. Example: "Would pair well with paid media agencies (drives traffic to the stores they build) or brand strategy firms (who design but don't build)."

3. **idealReferralProfile**: What kind of INCOMING opportunity is this evidence for? If someone was looking for help, what request would match? Example: "Companies needing Shopify Plus development with complex integrations, particularly in DTC/fashion/beauty verticals."

4. **taxonomyMapping**: Normalize skills and industries to standard categories. Use broad L2-level terms, not hyper-specific ones.

5. **evidenceStrength**: Rate as "weak" (vague, no specifics), "moderate" (some detail, partial metrics), or "strong" (named client, specific metrics, clear outcomes). Explain your reasoning.`,
    schema: z.object({
      capabilityProof: z.string().describe("Evidence-based statement of what this proves the firm can deliver"),
      partnershipSignals: z.string().describe("What partner types would complement this work"),
      idealReferralProfile: z.string().describe("What incoming opportunity this is evidence for"),
      taxonomyMapping: z.object({
        normalizedSkills: z.array(z.string()).describe("Normalized L2-level skill categories"),
        normalizedIndustries: z.array(z.string()).describe("Normalized industry categories"),
      }),
      evidenceStrength: z.enum(["weak", "moderate", "strong"]).describe("How strong is the evidence?"),
      evidenceReasoning: z.string().describe("Why this evidence strength rating"),
    }),
    maxOutputTokens: 800,
  });

  const durationMs = Date.now() - start;
  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;

  await logUsage({
    organizationId: options?.organizationId,
    model: FLASH_MODEL,
    feature: "abstraction",
    inputTokens,
    outputTokens,
    entityType: "case_study",
    entityId: options?.entityId,
    durationMs,
  });

  return result.object;
}
