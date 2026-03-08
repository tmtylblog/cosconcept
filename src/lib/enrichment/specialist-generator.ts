/**
 * Specialist Profile Generator
 *
 * Analyzes an expert's work history, skills, and their firm's case studies
 * to generate specialist profile niches.
 *
 * Example: Sarah Chen worked on 3 SaaS case studies + has "ABM" in skills
 * → Generate specialist profile "Fractional CMO for B2B SaaS"
 *
 * These profiles help with matching: when someone searches for
 * "SaaS marketing expert", we find Sarah through her specialist profile.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import type { PdlPerson } from "./pdl";
import { logUsage } from "@/lib/ai/gateway";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Types ─────────────────────────────────────────────────

export interface SpecialistProfile {
  /** e.g., "Fractional CMO for B2B SaaS" */
  title: string;
  /** Brief description of the expertise niche */
  description: string;
  /** Primary skills for this specialization */
  skills: string[];
  /** Industries this specialization serves */
  industries: string[];
  /** Years of relevant experience */
  yearsRelevant: number;
  /** Confidence score (0-1) based on evidence */
  confidence: number;
}

export interface ExpertProfileAnalysis {
  /** Generated specialist profiles (1-3 typically) */
  specialistProfiles: SpecialistProfile[];
  /** Suggested expert division classification */
  division: "collective_member" | "expert" | "trusted_expert";
  /** One-paragraph expert summary */
  summary: string;
  /** Key differentiators compared to generic professionals */
  differentiators: string[];
  /** Industries the expert serves across all work */
  industries: string[];
  /** Top skills from work history + pdl */
  topSkills: string[];
}

// ─── Generator ─────────────────────────────────────────────

/**
 * Generate specialist profiles for an expert.
 *
 * @param pdlPerson - PDL person data (work history, skills)
 * @param firmContext - Optional context about the firm's case studies
 * @param isCurrentMember - Whether this person is a current firm team member
 */
export async function generateSpecialistProfiles(params: {
  pdlPerson: PdlPerson;
  firmContext?: {
    firmName: string;
    caseStudies: { title: string; skills: string[]; industries: string[] }[];
    services: string[];
  };
  isCurrentMember?: boolean;
}): Promise<ExpertProfileAnalysis> {
  const { pdlPerson, firmContext, isCurrentMember } = params;

  // Build work history summary
  const workHistory = pdlPerson.experience
    .slice(0, 10)
    .map(
      (exp) =>
        `${exp.title} at ${exp.company.name}${exp.company.industry ? ` (${exp.company.industry})` : ""}${exp.isCurrent ? " [CURRENT]" : ""}${exp.startDate ? ` ${exp.startDate}` : ""}${exp.endDate ? ` - ${exp.endDate}` : ""}`
    )
    .join("\n");

  const education = pdlPerson.education
    .slice(0, 3)
    .map(
      (edu) =>
        `${edu.degrees.join(", ")} ${edu.majors.join(", ")} at ${edu.school.name}`
    )
    .join("\n");

  const caseStudyContext = firmContext?.caseStudies
    ?.map(
      (cs) =>
        `- ${cs.title} (skills: ${cs.skills.join(", ")}; industries: ${cs.industries.join(", ")})`
    )
    .join("\n");

  try {
    const specStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Generate specialist profiles for this professional services expert.

## EXPERT DATA
Name: ${pdlPerson.fullName}
Headline: ${pdlPerson.headline}
Current Role: ${pdlPerson.jobTitle} at ${pdlPerson.jobCompanyName}
Location: ${pdlPerson.location?.name ?? "Unknown"}
Skills: ${pdlPerson.skills.slice(0, 30).join(", ")}

## WORK HISTORY
${workHistory}

## EDUCATION
${education}

${
  firmContext
    ? `## FIRM CONTEXT
Firm: ${firmContext.firmName}
Services: ${firmContext.services.join(", ")}
${caseStudyContext ? `\nCase Studies:\n${caseStudyContext}` : ""}`
    : ""
}

## TASK
1. Generate 1-3 specialist profile titles that precisely describe this person's expertise niches.
   Format: "[Fractional/Senior/Lead] [Function] for [Industry/Company Type]"
   Examples: "Fractional CMO for B2B SaaS", "Growth Marketing Lead for DTC Brands", "Revenue Operations Expert for Mid-Market SaaS"

2. For each profile, identify the key skills, industries, and years of relevant experience.

3. Classify the expert:
   - "collective_member" if they are currently employed at a firm/agency (W2)
   - "expert" if they are a freelancer/contractor/fractional
   - "trusted_expert" if they have significant verified work history (10+ years, senior roles)

4. Write a one-paragraph summary and list 3-5 differentiators.

Be precise. Only generate profiles supported by the evidence.`,
      schema: z.object({
        specialistProfiles: z.array(
          z.object({
            title: z
              .string()
              .describe("Specialist title (e.g., 'Fractional CMO for B2B SaaS')"),
            description: z
              .string()
              .describe("Brief description of the expertise niche"),
            skills: z
              .array(z.string())
              .describe("Key skills for this specialization"),
            industries: z
              .array(z.string())
              .describe("Industries this specialization serves"),
            yearsRelevant: z
              .number()
              .describe("Estimated years of relevant experience"),
            confidence: z
              .number()
              .describe("Confidence score 0-1 based on evidence quality"),
          })
        ),
        division: z.enum(["collective_member", "expert", "trusted_expert"]),
        summary: z.string().describe("One-paragraph expert summary"),
        differentiators: z
          .array(z.string())
          .describe("Key differentiators (3-5 items)"),
        industries: z
          .array(z.string())
          .describe("All industries the expert serves"),
        topSkills: z
          .array(z.string())
          .describe("Top 10-15 skills from all evidence"),
      }),
      maxOutputTokens: 1024,
    });

    const specDuration = Date.now() - specStart;

    // Log AI usage
    await logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "expert",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: specDuration,
    });

    const analysis = result.object;

    // Override division if we know they're a current member
    if (isCurrentMember) {
      analysis.division = "collective_member";
    }

    return analysis;
  } catch (err) {
    console.error("[SpecialistGenerator] Generation failed:", err);
    // Return minimal analysis on failure
    return {
      specialistProfiles: [],
      division: isCurrentMember ? "collective_member" : "expert",
      summary: `${pdlPerson.fullName} - ${pdlPerson.headline}`,
      differentiators: [],
      industries: pdlPerson.experience
        .map((e) => e.company.industry)
        .filter((i): i is string => !!i)
        .filter((v, idx, arr) => arr.indexOf(v) === idx),
      topSkills: pdlPerson.skills.slice(0, 15),
    };
  }
}
