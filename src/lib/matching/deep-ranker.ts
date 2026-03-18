/**
 * Layer 3: LLM Deep Ranking
 *
 * Takes top ~50 candidates from Layer 2 and uses a large-context
 * LLM (Gemini Pro) to:
 * 1. Rank them by relevance to the searcher's needs
 * 2. Generate "why this match" explanations
 * 3. Check bidirectional fit (both parties benefit)
 * 4. Apply symbiotic bonuses from firm-relationships.csv
 *
 * This is the most expensive layer ($0.01-0.05 per query)
 * but only runs on ~50 candidates, not 1.5M.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import type { MatchCandidate, AbstractionProfile } from "./types";
import { logUsage } from "@/lib/ai/gateway";
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { firmCaseStudies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Load symbiotic relationships for partnership context
let _relationshipsCache: { typeA: string; typeB: string; nature: string; frequency: string }[] | null = null;

function getSymbioticRelationships() {
  if (_relationshipsCache) return _relationshipsCache;
  try {
    const csv = readFileSync(join(process.cwd(), "data/firm-relationships.csv"), "utf-8");
    const lines = csv.split("\n").slice(1).filter(Boolean);
    _relationshipsCache = lines.map((line) => {
      // CSV parsing — handle quoted fields
      const cols = parseCsvLine(line);
      return {
        typeA: cols[0] ?? "",
        typeB: cols[1] ?? "",
        nature: cols[2] ?? "",
        frequency: cols[5] ?? "",
      };
    }).filter((r) => r.typeA && r.typeB);
    return _relationshipsCache;
  } catch {
    _relationshipsCache = [];
    return _relationshipsCache;
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

interface RankingInput {
  rawQuery: string;
  searcherProfile?: AbstractionProfile;
  candidates: MatchCandidate[];
  /** Max results to return after ranking */
  topK?: number;
}

/**
 * Layer 3: LLM-powered deep ranking with explanations.
 *
 * Uses Gemini Pro (1M context) to process all candidates
 * in a single batch, providing nuanced ranking and explanations.
 */
export async function deepRank(input: RankingInput): Promise<MatchCandidate[]> {
  const { rawQuery, searcherProfile, candidates, topK = 15 } = input;

  if (candidates.length === 0) return [];

  // Enrich firm candidates with case study highlights (only for top 50, cheap)
  const firmCandidates = candidates.filter((c) => c.entityType === "firm" || !c.entityType);
  if (firmCandidates.length > 0) {
    await enrichWithCaseStudyHighlights(firmCandidates.slice(0, 50));
  }

  // Build entity-aware candidate summaries for the LLM
  const candidateSummaries = candidates
    .slice(0, 50)
    .map((c, i) => {
      const type = c.entityType ?? "firm";
      if (type === "expert") {
        const sp = c.preview.specialistProfileCount ?? 0;
        const cs = c.preview.caseStudyCount ?? 0;
        const title = c.preview.primarySpecialistTitle ?? "";
        const firm = c.preview.firmName ?? c.preview.subtitle ?? "";
        return `[${i}] EXPERT: ${c.displayName}${title ? ` (${title})` : ""}${firm ? ` @ ${firm}` : ""}
Skills: ${c.preview.topSkills.join(", ") || "N/A"}
Industries: ${c.preview.industries.join(", ") || "N/A"}
Markets: ${c.preview.markets?.join(", ") || "N/A"}
Evidence: ${sp} specialist profile${sp !== 1 ? "s" : ""}, ${cs} case stud${cs !== 1 ? "ies" : "y"}
Pre-score: ${c.totalScore.toFixed(2)}`;
      }
      if (type === "case_study") {
        const contrib = c.preview.contributorCount ?? 0;
        const firm = c.preview.firmName ?? c.preview.subtitle ?? "";
        return `[${i}] CASE STUDY: "${c.displayName}"${firm ? ` by ${firm}` : ""}
Skills Demonstrated: ${c.preview.topSkills.join(", ") || "N/A"}
Industries: ${c.preview.industries.join(", ") || "N/A"}
Contributors: ${contrib}
Pre-score: ${c.totalScore.toFixed(2)}`;
      }
      // firm (default)
      const cs = c.preview.caseStudyCount ?? 0;
      const teamExp = c.preview.teamExperience;
      const langs = c.preview.languages;
      const markets = c.preview.markets;
      const services = c.preview.topServices;
      const clientSize = c.preview.clientSizeSegment;
      const clientSizeLabel: Record<string, string> = {
        startup: "Startup/Early-stage clients",
        smb: "SMB clients (50-200 employees)",
        mid_market: "Mid-market clients (200-1000 employees)",
        enterprise: "Enterprise clients (1000+ employees)",
        mixed: "Mixed client sizes",
      };
      // Connected entity evidence lines
      const csSkills = c.preview.caseStudySkills;
      const expertSkills = c.preview.expertSkills;
      const clientInds = c.preview.clientIndustries;
      const topCl = c.preview.topClients;
      const csOutcomes = c.preview.caseStudyOutcomes;

      return `[${i}] FIRM: ${c.displayName}
Categories: ${c.preview.categories.join(", ") || "N/A"}
Services: ${services?.length ? services.join(", ") : "N/A"}
Skills: ${c.preview.topSkills.join(", ") || "N/A"}
Industries: ${c.preview.industries.join(", ") || "N/A"}
Markets: ${markets?.length ? markets.join(", ") : "N/A"}
${clientSize ? `Client Segment: ${clientSizeLabel[clientSize] ?? clientSize}\n` : ""}${langs?.length ? `Languages: ${langs.join(", ")}\n` : ""}${cs > 0 ? `Evidence: ${cs} case stud${cs !== 1 ? "ies" : "y"} (proven work)\n` : "No case studies (unproven)\n"}${csSkills?.length ? `Case Study Skills (proven): ${csSkills.slice(0, 8).map((s) => `${s.name} (${s.count}x)`).join(", ")}\n` : ""}${expertSkills?.length ? `Team Skill Coverage: ${expertSkills.slice(0, 6).map((s) => `${s.name} (${s.expertCount} experts)`).join(", ")}\n` : ""}${clientInds?.length ? `Client Industries: ${clientInds.slice(0, 5).map((ci) => `${ci.name} (${ci.count})`).join(", ")}\n` : ""}${topCl?.length ? `Notable Clients: ${topCl.slice(0, 5).join(", ")}\n` : ""}${csOutcomes?.length ? `Proven Outcomes: ${csOutcomes.slice(0, 3).join("; ")}\n` : ""}${c.preview.caseStudyHighlights?.length ? `Key Outcomes: ${c.preview.caseStudyHighlights.slice(0, 3).join("; ")}\n` : ""}${teamExp ? `Team Experience: ${teamExp}\n` : ""}Pre-score: ${c.totalScore.toFixed(2)}`;
    })
    .join("\n\n");

  const searcherContext = searcherProfile
    ? `
## SEARCHER PROFILE
Services: ${searcherProfile.topServices.join(", ")}
Skills: ${searcherProfile.topSkills.join(", ")}
Industries: ${searcherProfile.topIndustries.join(", ")}
Looking for: ${searcherProfile.partnershipReadiness.preferredPartnerTypes.join(", ")}
Goals: ${searcherProfile.partnershipReadiness.partnershipGoals.join(", ")}
`
    : "";

  // Build symbiotic relationship context
  let symbioticContext = "";
  const relationships = getSymbioticRelationships();
  if (relationships.length > 0) {
    // Match against searcher's categories, services, and industries for broader coverage
    const searcherTerms = [
      ...(searcherProfile?.topServices ?? []),
      ...(searcherProfile?.topIndustries ?? []),
      ...(searcherProfile?.topSkills ?? []).slice(0, 5),
    ];
    // Add categories from evidenceSources or partnershipReadiness
    if (searcherProfile?.evidenceSources) {
      const es = searcherProfile.evidenceSources as Record<string, unknown>;
      if (Array.isArray(es.categories)) searcherTerms.push(...(es.categories as string[]));
    }
    if (searcherProfile?.partnershipReadiness?.preferredPartnerTypes) {
      searcherTerms.push(...searcherProfile.partnershipReadiness.preferredPartnerTypes);
    }
    const relevantRels = searcherTerms.length > 0
      ? relationships.filter((r) =>
          searcherTerms.some((term) =>
            r.typeA.toLowerCase().includes(term.toLowerCase()) ||
            r.typeB.toLowerCase().includes(term.toLowerCase()) ||
            term.toLowerCase().includes(r.typeA.toLowerCase().split(" ")[0]) ||
            term.toLowerCase().includes(r.typeB.toLowerCase().split(" ")[0])
          )
        ).slice(0, 15)
      : relationships.filter((r) => r.frequency === "High").slice(0, 15);

    if (relevantRels.length > 0) {
      symbioticContext = `\n## SYMBIOTIC PARTNERSHIPS (common firm pairings)\n${relevantRels.map((r) => `- ${r.typeA} ↔ ${r.typeB}: ${r.nature.slice(0, 100)}`).join("\n")}\n\nBoost candidates whose category forms a known symbiotic pair with the searcher.`;
    }
  }

  try {
    const rankStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `You are ranking potential partnership matches for a professional services firm.

## SEARCH QUERY
"${rawQuery}"
${searcherContext}${symbioticContext}

## CANDIDATES
${candidateSummaries}

## INSTRUCTIONS
1. ALWAYS return the top ${topK} candidates — never return an empty list, even if matches are imperfect
2. For each, provide a 1-2 sentence explanation of WHY this could be relevant (honest about fit quality)
3. Score bidirectional fit:
   - theyWantUs: how much the candidate would want to partner with the searcher (0-1)
   - weWantThem: how much the searcher would want this candidate (0-1)
4. Give each a final llmScore (0-1) — use lower scores (0.2-0.4) for partial matches rather than excluding them

Results may include FIRMS, EXPERTS, and CASE STUDIES — rank all together by relevance.

RANKING PRIORITIES (most important first):
1. PROVEN WORK: Firms with case studies (proven work) should rank significantly higher than those without. A firm with 10 case studies is far more credible than one with zero.
2. CASE STUDY PROOF: When "Case Study Skills (proven)" are listed, these are skills DEMONSTRATED in actual projects — much stronger than self-described skills. A firm with "AI/ML (3x)" in case study skills has delivered AI/ML 3 times vs one that just lists it.
3. COMPLEMENTARY FIT: Focus on entities that fill gaps in what the searcher needs — not duplicates of what they already do.
4. EVIDENCE QUALITY: Weight case study evidence > specialist profiles > listed skills > self-described categories. Skills backed by multiple evidence sources are more reliable.
5. TEAM DEPTH: "Team Skill Coverage" shows how many experts have each skill. A firm where 4 experts have "Data Engineering" has deeper capability than one where 1 person lists it. Firms whose team has worked at relevant companies/industries have deeper practical experience.
6. CLIENT PORTFOLIO: "Client Industries" reveals implicit expertise. A firm that served 5 FinTech clients deeply understands FinTech even if they don't list it explicitly. "Notable Clients" shows real companies they've worked with.
7. MARKET/LANGUAGE FIT: If the query mentions geography or cross-border needs, weight market presence and language capabilities.
6. SYMBIOTIC PARTNERSHIPS: If candidate categories form known symbiotic pairs with the searcher, that's a natural fit signal.
7. For firms marked "No case studies (unproven)" — lower confidence but don't exclude. Some newer firms may still be relevant.

IMPORTANT: Always return results. A partial match with a low score is better than no result.`,
      schema: z.object({
        rankedMatches: z.array(
          z.object({
            candidateIndex: z
              .number()
              .describe("Index of the candidate from the list above"),
            llmScore: z.number().describe("Final relevance score 0-1"),
            explanation: z
              .string()
              .describe("1-2 sentence explanation of why this is a good match"),
            theyWantUs: z
              .number()
              .describe("How much they'd want to partner with the searcher (0-1)"),
            weWantThem: z
              .number()
              .describe("How much the searcher would want them (0-1)"),
          })
        ),
      }),
      maxOutputTokens: 2048,
    });

    const rankDuration = Date.now() - rankStart;

    // Log AI usage
    await logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "matching",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: rankDuration,
    });

    // Map LLM rankings back to candidates
    const rankedCandidates: MatchCandidate[] = [];
    for (const match of result.object.rankedMatches) {
      const idx = match.candidateIndex;
      if (idx < 0 || idx >= candidates.length) continue;

      const candidate = candidates[idx];
      rankedCandidates.push({
        ...candidate,
        llmScore: match.llmScore,
        matchExplanation: match.explanation,
        bidirectionalFit: {
          theyWantUs: match.theyWantUs,
          weWantThem: match.weWantThem,
        },
        // Final score: 30% structured + 20% vector + 50% LLM
        totalScore:
          candidate.structuredScore * 0.3 +
          candidate.vectorScore * 0.2 +
          match.llmScore * 0.5,
      });
    }

    // Sort by final score
    rankedCandidates.sort((a, b) => b.totalScore - a.totalScore);

    // Safety net: if LLM returned 0 matches despite having candidates, fall back to Layer 2
    if (rankedCandidates.length === 0 && candidates.length > 0) {
      console.warn("[DeepRanker] LLM returned 0 matches — falling back to Layer 2 results");
      return candidates.slice(0, topK);
    }

    return rankedCandidates.slice(0, topK);
  } catch (err) {
    console.error("[DeepRanker] LLM ranking failed:", err);
    // Fall back to Layer 2 scores
    return candidates.slice(0, topK);
  }
}

/**
 * Enrich firm candidates with case study outcome highlights.
 * Loads cosAnalysis.outcomes from firmCaseStudies for each firm.
 * Only runs for the top ~50 candidates going into the LLM ranker.
 */
async function enrichWithCaseStudyHighlights(candidates: MatchCandidate[]): Promise<void> {
  const firmIds = candidates.map((c) => c.entityId).filter(Boolean);
  if (firmIds.length === 0) return;

  try {
    // Batch query: get top outcomes for all candidate firms
    const rows = await db
      .select({
        firmId: firmCaseStudies.firmId,
        cosAnalysis: firmCaseStudies.cosAnalysis,
      })
      .from(firmCaseStudies)
      .where(
        and(
          eq(firmCaseStudies.status, "active"),
        )
      );

    // Build a map of firmId -> outcomes
    const outcomesByFirm = new Map<string, string[]>();
    for (const row of rows) {
      if (!firmIds.includes(row.firmId)) continue;
      const analysis = row.cosAnalysis as { outcomes?: string[] } | null;
      if (analysis?.outcomes?.length) {
        const existing = outcomesByFirm.get(row.firmId) ?? [];
        existing.push(...analysis.outcomes);
        outcomesByFirm.set(row.firmId, existing);
      }
    }

    // Attach to candidates
    for (const candidate of candidates) {
      const outcomes = outcomesByFirm.get(candidate.entityId);
      if (outcomes?.length) {
        // Dedupe and take top 5
        candidate.preview.caseStudyHighlights = [...new Set(outcomes)].slice(0, 5);
      }
    }
  } catch (err) {
    // Non-critical — don't fail the ranking
    console.warn("[DeepRanker] Failed to load case study highlights:", err);
  }
}
