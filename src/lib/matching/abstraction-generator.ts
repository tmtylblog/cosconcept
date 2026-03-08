/**
 * Abstraction Profile Generator
 *
 * Creates hidden, normalized profiles for every firm/expert/case study.
 * These profiles make entities comparable regardless of how they describe themselves.
 *
 * Evidence-based: more case studies = higher confidence.
 * Normalized: same structure whether it's a 3-person agency or a 500-person consultancy.
 *
 * The abstraction is what gets embedded and used for vector similarity search.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { abstractionProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { AbstractionProfile } from "./types";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Input types ───────────────────────────────────────────

interface FirmEvidence {
  firmId: string;
  name: string;
  website?: string;
  /** Services extracted from website */
  services: string[];
  /** About/pitch text */
  aboutPitch: string;
  /** AI-classified categories */
  categories: string[];
  /** AI-classified L2 skills */
  skills: string[];
  /** AI-classified industries */
  industries: string[];
  /** AI-classified markets */
  markets: string[];
  /** Case studies with details */
  caseStudies: {
    title: string;
    clientName?: string;
    skills: string[];
    industries: string[];
    outcomes: string[];
  }[];
  /** Team members with roles */
  experts: {
    name: string;
    headline?: string;
    skills: string[];
  }[];
  /** PDL firmographic data */
  pdl?: {
    industry: string;
    size: string;
    employeeCount: number;
    summary: string;
  };
}

// ─── Generator ─────────────────────────────────────────────

/**
 * Generate an abstraction profile for a firm.
 *
 * Gathers all evidence, sends to AI to create a normalized narrative,
 * then stores in the abstractionProfiles table.
 */
export async function generateFirmAbstraction(
  evidence: FirmEvidence
): Promise<AbstractionProfile> {
  // Build evidence summary for the AI
  const caseStudySummary =
    evidence.caseStudies.length > 0
      ? evidence.caseStudies
          .slice(0, 10)
          .map(
            (cs) =>
              `- ${cs.title}${cs.clientName ? ` (${cs.clientName})` : ""}: skills=${cs.skills.join(",")} industries=${cs.industries.join(",")}`
          )
          .join("\n")
      : "No case studies available";

  const expertSummary =
    evidence.experts.length > 0
      ? evidence.experts
          .slice(0, 10)
          .map(
            (e) =>
              `- ${e.name}${e.headline ? `: ${e.headline}` : ""} skills=${e.skills.slice(0, 5).join(",")}`
          )
          .join("\n")
      : "No expert data available";

  const result = await generateObject({
    model: openrouter.chat("google/gemini-2.0-flash-001"),
    prompt: `Generate a normalized abstraction profile for this professional services firm.

## FIRM DATA
Name: ${evidence.name}
Website: ${evidence.website ?? "N/A"}
Categories: ${evidence.categories.join(", ") || "Unknown"}
Skills (L2): ${evidence.skills.join(", ") || "Unknown"}
Industries: ${evidence.industries.join(", ") || "Unknown"}
Markets: ${evidence.markets.join(", ") || "Unknown"}
About: ${evidence.aboutPitch.slice(0, 500)}
Services: ${evidence.services.join(", ") || "Unknown"}
${evidence.pdl ? `PDL: ${evidence.pdl.industry} | ${evidence.pdl.size} | ${evidence.pdl.employeeCount} employees | ${evidence.pdl.summary}` : ""}

## CASE STUDIES
${caseStudySummary}

## TEAM
${expertSummary}

## INSTRUCTIONS
Create a normalized profile that captures:
1. A 200-word "hidden narrative" — a structured summary of what this firm actually does, based on evidence
2. Top services (what they actually deliver, not just claim)
3. Top skills (specific capabilities demonstrated)
4. Industries they serve (based on case studies + clients, not just claims)
5. Typical client profile (size, type, industry)
6. Partnership readiness signals

Prioritize EVIDENCE over CLAIMS. Case studies and actual work > marketing copy.
Be specific and factual. Avoid generic language.`,
    schema: z.object({
      hiddenNarrative: z
        .string()
        .describe("200-word structured summary of what this firm actually does"),
      topServices: z
        .array(z.string())
        .describe("Top 5-10 services they actually deliver"),
      topSkills: z
        .array(z.string())
        .describe("Top 10-15 specific skills/tools demonstrated"),
      topIndustries: z
        .array(z.string())
        .describe("Industries served based on evidence"),
      typicalClientProfile: z
        .string()
        .describe("Description of their typical client (size, type, needs)"),
      partnershipReadiness: z.object({
        openToPartnerships: z.boolean(),
        preferredPartnerTypes: z
          .array(z.string())
          .describe("Types of firms they'd partner well with"),
        partnershipGoals: z
          .array(z.string())
          .describe("What they'd gain from partnerships"),
      }),
    }),
    maxOutputTokens: 1024,
  });

  // Calculate confidence scores based on evidence quantity
  const csCount = evidence.caseStudies.length;
  const expertCount = evidence.experts.length;
  const hasWebsite = !!evidence.website;
  const hasPdl = !!evidence.pdl;

  const confidenceScores = {
    services: Math.min(1, (csCount * 0.15 + (evidence.services.length > 0 ? 0.3 : 0) + (hasPdl ? 0.1 : 0))),
    skills: Math.min(1, (csCount * 0.1 + evidence.skills.length * 0.03)),
    industries: Math.min(1, (csCount * 0.1 + evidence.industries.length * 0.05)),
    clientProfile: Math.min(1, csCount * 0.2),
    overall: Math.min(
      1,
      csCount * 0.1 +
        expertCount * 0.05 +
        (hasWebsite ? 0.15 : 0) +
        (hasPdl ? 0.1 : 0) +
        (evidence.services.length > 0 ? 0.1 : 0)
    ),
  };

  const profile: AbstractionProfile = {
    id: `abs_${evidence.firmId}`,
    entityType: "firm",
    entityId: evidence.firmId,
    hiddenNarrative: result.object.hiddenNarrative,
    topServices: result.object.topServices,
    topSkills: result.object.topSkills,
    topIndustries: result.object.topIndustries,
    typicalClientProfile: result.object.typicalClientProfile,
    partnershipReadiness: result.object.partnershipReadiness,
    confidenceScores,
    evidenceSources: {
      caseStudyCount: csCount,
      expertCount,
      websitePages: hasWebsite ? 1 : 0,
      pdlAvailable: hasPdl,
    },
  };

  // Persist to database (all AI-generated fields)
  await db
    .insert(abstractionProfiles)
    .values({
      id: profile.id,
      entityType: profile.entityType,
      entityId: profile.entityId,
      hiddenNarrative: profile.hiddenNarrative,
      topServices: profile.topServices,
      topSkills: profile.topSkills,
      topIndustries: profile.topIndustries,
      typicalClientProfile: profile.typicalClientProfile,
      partnershipReadiness: profile.partnershipReadiness,
      confidenceScores: profile.confidenceScores,
      evidenceSources: profile.evidenceSources,
      lastEnrichedAt: new Date(),
      enrichmentVersion: 1,
    })
    .onConflictDoUpdate({
      target: abstractionProfiles.id,
      set: {
        hiddenNarrative: profile.hiddenNarrative,
        topServices: profile.topServices,
        topSkills: profile.topSkills,
        topIndustries: profile.topIndustries,
        typicalClientProfile: profile.typicalClientProfile,
        partnershipReadiness: profile.partnershipReadiness,
        confidenceScores: profile.confidenceScores,
        evidenceSources: profile.evidenceSources,
        lastEnrichedAt: new Date(),
        enrichmentVersion: 1,
        updatedAt: new Date(),
      },
    });

  return profile;
}

/**
 * Load an existing abstraction profile from the database.
 */
export async function loadAbstractionProfile(
  entityId: string,
  entityType: "firm" | "expert" | "case_study" = "firm"
): Promise<AbstractionProfile | null> {
  const id = `abs_${entityId}`;
  const rows = await db
    .select()
    .from(abstractionProfiles)
    .where(eq(abstractionProfiles.id, id))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  const confidence = (row.confidenceScores ?? {}) as AbstractionProfile["confidenceScores"];
  const evidence = (row.evidenceSources ?? {}) as AbstractionProfile["evidenceSources"];

  return {
    id: row.id,
    entityType: entityType,
    entityId: row.entityId,
    hiddenNarrative: row.hiddenNarrative ?? "",
    topServices: (row.topServices as string[]) ?? [],
    topSkills: (row.topSkills as string[]) ?? [],
    topIndustries: (row.topIndustries as string[]) ?? [],
    typicalClientProfile: row.typicalClientProfile ?? "",
    partnershipReadiness: (row.partnershipReadiness as AbstractionProfile["partnershipReadiness"]) ?? {
      openToPartnerships: true,
      preferredPartnerTypes: [],
      partnershipGoals: [],
    },
    confidenceScores: confidence,
    evidenceSources: evidence,
  };
}
