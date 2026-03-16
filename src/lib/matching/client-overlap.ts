/**
 * Client Overlap Analysis — cross-references user's clients against partner capabilities.
 *
 * Aggregates clients from multiple sources, scores each against the partner,
 * and generates collaboration ideas for meeting prep.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { serviceFirms, firmCaseStudies } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { AbstractionProfile } from "./types";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Types ────────────────────────────────────────────────

interface ClientEntry {
  name: string;
  source: "enrichment" | "case_study";
}

interface RelevantClient {
  clientName: string;
  relevanceScore: number;
  reasons: string[];
  partnerSkillsApplicable: string[];
  collaborationIdea: string;
}

export interface ClientOverlapResult {
  totalClients: number;
  analyzedClients: number;
  relevantClients: RelevantClient[];
  meetingTalkingPoints: string[];
}

interface PartnerCapabilities {
  name: string;
  categories: string[];
  skills: string[];
  industries: string[];
  topServices: string[];
  caseStudyCount: number;
}

// ─── Client Aggregation ───────────────────────────────────

async function aggregateClientList(firmId: string): Promise<ClientEntry[]> {
  const clientMap = new Map<string, ClientEntry>();

  // Source 1: enrichmentData.extracted.clients
  try {
    const [firm] = await db
      .select({ enrichmentData: serviceFirms.enrichmentData })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, firmId))
      .limit(1);

    const ed = firm?.enrichmentData as Record<string, unknown> | null;
    const extracted = ed?.extracted as Record<string, unknown> | null;
    const clients = (extracted?.clients as string[]) ?? [];

    for (const name of clients) {
      const key = name.trim().toLowerCase();
      if (key && !clientMap.has(key)) {
        clientMap.set(key, { name: name.trim(), source: "enrichment" });
      }
    }
  } catch (err) {
    console.error("[ClientOverlap] Failed to load enrichment clients:", err);
  }

  // Source 2: case study autoTags.clientName
  try {
    const caseStudies = await db
      .select({
        autoTags: firmCaseStudies.autoTags,
      })
      .from(firmCaseStudies)
      .where(eq(firmCaseStudies.firmId, firmId));

    for (const cs of caseStudies) {
      const tags = cs.autoTags as Record<string, unknown> | null;
      const clientName = tags?.clientName as string | null;
      if (clientName) {
        const key = clientName.trim().toLowerCase();
        if (!clientMap.has(key)) {
          clientMap.set(key, { name: clientName.trim(), source: "case_study" });
        }
      }
    }
  } catch (err) {
    console.error("[ClientOverlap] Failed to load case study clients:", err);
  }

  return Array.from(clientMap.values());
}

// ─── Per-Client Scoring ───────────────────────────────────

function scoreClientRelevance(
  _clientName: string,
  partner: PartnerCapabilities
): { score: number; reasons: string[]; applicableSkills: string[] } {
  // Without client industry data, we score based on partner breadth
  // The batch AI call later generates the real insight
  const reasons: string[] = [];
  let score = 30; // base score for any client

  // Partners with broad industry coverage are more likely relevant
  if (partner.industries.length >= 5) {
    score += 15;
    reasons.push("Partner covers many industries");
  }

  // Partners with many skills are more versatile
  if (partner.skills.length >= 8) {
    score += 10;
    reasons.push("Partner has diverse skill set");
  }

  // Partners with case studies are more credible
  if (partner.caseStudyCount >= 3) {
    score += 15;
    reasons.push(`Partner has ${partner.caseStudyCount} proven case studies`);
  }

  return {
    score: Math.min(100, score),
    reasons,
    applicableSkills: partner.skills.slice(0, 5),
  };
}

// ─── Batch AI: Collaboration Ideas ────────────────────────

async function generateCollaborationIdeas(
  clients: { name: string; score: number }[],
  partner: PartnerCapabilities,
  firmName: string
): Promise<{ ideas: Record<string, string>; talkingPoints: string[] }> {
  try {
    const clientList = clients.map((c) => c.name).join(", ");

    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Generate collaboration ideas for a meeting between ${firmName} and ${partner.name}.

## PARTNER: ${partner.name}
Categories: ${partner.categories.join(", ")}
Services: ${partner.topServices.join(", ")}
Skills: ${partner.skills.join(", ")}
Industries: ${partner.industries.join(", ")}

## ${firmName.toUpperCase()}'S CLIENTS
${clientList}

## INSTRUCTIONS
For each client listed, generate a one-line collaboration idea — a specific way ${firmName} and ${partner.name} could work together for that client.
Also generate 3-5 overall meeting talking points.

Be specific and practical. Reference real capabilities.`,
      schema: z.object({
        clientIdeas: z.array(z.object({
          clientName: z.string(),
          idea: z.string().describe("One-line collaboration idea"),
        })),
        meetingTalkingPoints: z.array(z.string()).describe("3-5 conversation starters for the meeting"),
      }),
      maxOutputTokens: 1024,
    });

    const ideas: Record<string, string> = {};
    for (const item of result.object.clientIdeas) {
      ideas[item.clientName.toLowerCase()] = item.idea;
    }

    return { ideas, talkingPoints: result.object.meetingTalkingPoints };
  } catch (err) {
    console.error("[ClientOverlap] AI generation failed:", err);
    return {
      ideas: {},
      talkingPoints: [`Discuss how ${partner.name}'s ${partner.categories[0] ?? "expertise"} could benefit your shared clients`],
    };
  }
}

// ─── Main Analysis Function ───────────────────────────────

export async function analyzeClientOverlap(params: {
  firmId: string;
  firmName: string;
  partnerName: string;
  partnerCategories: string[];
  partnerSkills: string[];
  partnerIndustries: string[];
  partnerTopServices: string[];
  partnerCaseStudyCount: number;
}): Promise<ClientOverlapResult> {
  const {
    firmId,
    firmName,
    partnerName,
    partnerCategories,
    partnerSkills,
    partnerIndustries,
    partnerTopServices,
    partnerCaseStudyCount,
  } = params;

  // 1. Aggregate client list
  const clients = await aggregateClientList(firmId);

  if (clients.length === 0) {
    return {
      totalClients: 0,
      analyzedClients: 0,
      relevantClients: [],
      meetingTalkingPoints: [],
    };
  }

  const partner: PartnerCapabilities = {
    name: partnerName,
    categories: partnerCategories,
    skills: partnerSkills,
    industries: partnerIndustries,
    topServices: partnerTopServices,
    caseStudyCount: partnerCaseStudyCount,
  };

  // 2. Score each client
  const scored = clients.map((client) => {
    const { score, reasons, applicableSkills } = scoreClientRelevance(client.name, partner);
    return {
      clientName: client.name,
      score,
      reasons,
      applicableSkills,
    };
  });

  // Sort by score descending, take top 8 for AI ideas
  scored.sort((a, b) => b.score - a.score);
  const topClients = scored.slice(0, 8);

  // 3. Generate collaboration ideas (batch AI call)
  const { ideas, talkingPoints } = await generateCollaborationIdeas(
    topClients.map((c) => ({ name: c.clientName, score: c.score })),
    partner,
    firmName
  );

  // 4. Build final results
  const relevantClients: RelevantClient[] = topClients.map((c) => ({
    clientName: c.clientName,
    relevanceScore: c.score,
    reasons: c.reasons,
    partnerSkillsApplicable: c.applicableSkills,
    collaborationIdea: ideas[c.clientName.toLowerCase()] ?? `Explore how ${partnerName} can add value for ${c.clientName}`,
  }));

  return {
    totalClients: clients.length,
    analyzedClients: topClients.length,
    relevantClients,
    meetingTalkingPoints: talkingPoints,
  };
}
