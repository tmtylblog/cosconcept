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
      return `[${i}] FIRM: ${c.displayName}
Categories: ${c.preview.categories.join(", ") || "N/A"}
Skills: ${c.preview.topSkills.join(", ") || "N/A"}
Industries: ${c.preview.industries.join(", ") || "N/A"}
${cs > 0 ? `Evidence: ${cs} case stud${cs !== 1 ? "ies" : "y"}\n` : ""}Pre-score: ${c.totalScore.toFixed(2)}`;
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

  try {
    const rankStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `You are ranking potential partnership matches for a professional services firm.

## SEARCH QUERY
"${rawQuery}"
${searcherContext}

## CANDIDATES
${candidateSummaries}

## INSTRUCTIONS
1. Rank the top ${topK} candidates by relevance to the search query
2. For each, provide a 1-2 sentence explanation of WHY this is a good match
3. Score bidirectional fit:
   - theyWantUs: how much the candidate would want to partner with the searcher (0-1)
   - weWantThem: how much the searcher would want this candidate (0-1)
4. Give each a final llmScore (0-1) combining relevance + bidirectional fit

Results may include FIRMS, EXPERTS, and CASE STUDIES — rank all together by relevance.
Focus on COMPLEMENTARY capabilities — entities that fill gaps, not duplicates.
For experts: weight case study evidence > specialist profiles > listed skills.
For case studies: weight demonstrated skills and industry match.
For firms: weight proven work (case studies) over self-described categories.`,
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
    return rankedCandidates.slice(0, topK);
  } catch (err) {
    console.error("[DeepRanker] LLM ranking failed:", err);
    // Fall back to Layer 2 scores
    return candidates.slice(0, topK);
  }
}
