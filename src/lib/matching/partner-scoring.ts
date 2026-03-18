/**
 * Partner Scoring Module
 *
 * Reusable scoring logic for partner matching, extracted from
 * /api/partner-matching/route.ts so it can be shared by the
 * admin simulator and any future matching surfaces.
 *
 * Scoring dimensions (max ~110 raw, normalized to 0-100):
 * 1. Capability gap match (0-30)
 * 2. Reverse match (0-20)
 * 3. Firm type preference (0-20: 15 forward + 5 reverse)
 * 4. Geography overlap (0-10)
 * 5. Symbiotic relationship bonus (0-10)
 * 6. Deal breaker penalty (0 or -40)
 * 7. Industry overlap (0-5)
 * 8. Data richness (0-5)
 * 9. Preference completeness (0-10)
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { logUsage } from "@/lib/ai/gateway";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────

export interface FirmWithPrefs {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  firmType: string | null;
  enrichmentData: Record<string, unknown> | null;
  prefs: Record<string, unknown>;
}

export interface ScoreBreakdown {
  capabilityGapMatch: number; // 0-30
  reverseMatch: number; // 0-20
  firmTypePreference: number; // 0-20 (15 forward + 5 reverse)
  geographyOverlap: number; // 0-10
  symbioticBonus: number; // 0-10
  dealBreakerPenalty: number; // 0 or -40
  industryOverlap: number; // 0-5
  dataRichness: number; // 0-5
  preferenceCompleteness: number; // 0-10
  total: number; // 0-100 normalized
}

export interface ScoredMatch {
  firm: FirmWithPrefs;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  symbioticType: string | null;
  reverseGaps: string[];
  cServices: string[];
  cIndustries: string[];
  cSkills: string[];
}

export interface PartnerMatch {
  firmId: string;
  firmName: string;
  website: string | null;
  description: string | null;
  firmType: string | null;
  services: string[];
  industries: string[];
  skills: string[];
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  explanation: string;
  symbioticType: string | null;
  theirGapsThatYouFill: string[];
  talkingPoints: string[];
  bidirectionalFit: {
    theyWantUs: number;
    weWantThem: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────

/** Coerce unknown value to string array */
export function asArr(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v) => typeof v === "string");
  if (typeof val === "string" && val) return [val];
  return [];
}

/** Case-insensitive substring match in either direction */
export function fuzzyMatch(a: string, b: string): boolean {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  return al.includes(bl) || bl.includes(al);
}

/** Read firm data from enrichment: confirmed > classification/extracted */
export function getFirmData(enrichment: Record<string, unknown>) {
  const confirmed =
    (enrichment.confirmed as Record<string, unknown>) ?? {};
  const classification =
    (enrichment.classification as Record<string, unknown>) ?? {};
  const extracted =
    (enrichment.extracted as Record<string, unknown>) ?? {};
  return {
    services:
      asArr(confirmed.services).length > 0
        ? asArr(confirmed.services)
        : asArr(extracted.services),
    skills:
      asArr(confirmed.skills).length > 0
        ? asArr(confirmed.skills)
        : asArr(classification.skills),
    industries:
      asArr(confirmed.industries).length > 0
        ? asArr(confirmed.industries)
        : asArr(classification.industries),
    markets:
      asArr(confirmed.markets).length > 0
        ? asArr(confirmed.markets)
        : asArr(classification.markets),
    categories:
      asArr(confirmed.firmCategory ? [confirmed.firmCategory] : []).length > 0
        ? asArr([confirmed.firmCategory])
        : asArr(classification.categories),
  };
}

// ─── CSV parser ──────────────────────────────────────────────

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

// ─── Symbiotic relationships cache ──────────────────────────

let _relCache: { typeA: string; typeB: string; nature: string }[] | null =
  null;

export function getSymbioticRelationships() {
  if (_relCache) return _relCache;
  try {
    const csv = readFileSync(
      join(process.cwd(), "data/firm-relationships.csv"),
      "utf-8"
    );
    const lines = csv.split("\n").slice(1).filter(Boolean);
    _relCache = lines
      .map((line) => {
        const cols = parseCsvLine(line);
        return {
          typeA: cols[0] ?? "",
          typeB: cols[1] ?? "",
          nature: cols[2] ?? "",
        };
      })
      .filter((r) => r.typeA && r.typeB);
    return _relCache;
  } catch {
    _relCache = [];
    return _relCache;
  }
}

// ─── Scoring Engine ─────────────────────────────────────────

export interface ScorePartnerMatchesOpts {
  sourceFirm: {
    id: string;
    name: string;
    firmType: string | null;
    enrichmentData: Record<string, unknown>;
  };
  preferences: Record<string, unknown>;
  candidates: FirmWithPrefs[];
}

/**
 * Score candidate firms against a source firm and its preferences.
 * Returns ScoredMatch[] sorted by score descending.
 */
export function scorePartnerMatches(
  opts: ScorePartnerMatchesOpts
): ScoredMatch[] {
  const { sourceFirm, preferences, candidates } = opts;
  const relationships = getSymbioticRelationships();

  const userData = getFirmData(sourceFirm.enrichmentData);
  const userServices = userData.services;
  const userSkills = userData.skills;
  const userIndustries = userData.industries;
  const userCapGaps = asArr(preferences.capabilityGaps);
  const userPrefTypes = asArr(preferences.preferredPartnerTypes);
  const userGeo = String(
    preferences.geographyPreference ?? ""
  ).toLowerCase();
  const userDealBreaker = String(
    preferences.dealBreaker ?? ""
  ).toLowerCase();
  const userCategory = (
    userData.categories[0] ?? String(sourceFirm.firmType ?? "")
  ).toLowerCase();

  const scored = candidates.map((c) => {
    const cEnrichment = c.enrichmentData ?? {};
    const cData = getFirmData(cEnrichment);
    const cServices = cData.services;
    const cSkills = cData.skills;
    const cIndustries = cData.industries;
    const cMarkets = cData.markets;
    const cCategory = (
      cData.categories[0] ?? String(c.firmType ?? "")
    ).toLowerCase();
    const cCapGaps = asArr(c.prefs.capabilityGaps);
    const cPrefTypes = asArr(c.prefs.preferredPartnerTypes);

    const breakdown: ScoreBreakdown = {
      capabilityGapMatch: 0,
      reverseMatch: 0,
      firmTypePreference: 0,
      geographyOverlap: 0,
      symbioticBonus: 0,
      dealBreakerPenalty: 0,
      industryOverlap: 0,
      dataRichness: 0,
      preferenceCompleteness: 0,
      total: 0,
    };

    // 1. Capability gap match: their services/skills fill your gaps (0-30)
    const gapFillCount = userCapGaps.filter(
      (gap) =>
        cServices.some((s) => fuzzyMatch(s, gap)) ||
        cSkills.some((s) => fuzzyMatch(s, gap))
    ).length;
    breakdown.capabilityGapMatch =
      userCapGaps.length > 0
        ? Math.round((gapFillCount / userCapGaps.length) * 30 * 10) / 10
        : 10;

    // 2. Reverse match: your services fill their gaps (0-20)
    const reverseGaps = cCapGaps.filter(
      (gap) =>
        userServices.some((s) => fuzzyMatch(s, gap)) ||
        userSkills.some((s) => fuzzyMatch(s, gap))
    );
    breakdown.reverseMatch =
      cCapGaps.length > 0
        ? Math.round((reverseGaps.length / cCapGaps.length) * 20 * 10) / 10
        : 5;

    // 3. Firm type preference (0-20: 15 forward + 5 reverse)
    if (userPrefTypes.length > 0 && cCategory) {
      if (userPrefTypes.some((t) => fuzzyMatch(cCategory, t))) {
        breakdown.firmTypePreference += 15;
      }
    }
    if (cPrefTypes.length > 0 && userCategory) {
      if (cPrefTypes.some((t) => fuzzyMatch(userCategory, t))) {
        breakdown.firmTypePreference += 5;
      }
    }

    // 4. Geography overlap (0-10)
    if (userGeo && cMarkets.length > 0) {
      breakdown.geographyOverlap = cMarkets.some((m) =>
        fuzzyMatch(m, userGeo)
      )
        ? 10
        : 0;
    } else {
      breakdown.geographyOverlap = 3; // No preference = slight boost
    }

    // 5. Symbiotic relationship bonus (0-10)
    let symbioticType: string | null = null;
    if (userCategory && cCategory) {
      const rel = relationships.find(
        (r) =>
          (fuzzyMatch(r.typeA, userCategory) &&
            fuzzyMatch(r.typeB, cCategory)) ||
          (fuzzyMatch(r.typeA, cCategory) &&
            fuzzyMatch(r.typeB, userCategory))
      );
      if (rel) {
        breakdown.symbioticBonus = 10;
        symbioticType = rel.nature;
      }
    }

    // 6. Deal breaker check (0 or -40)
    if (userDealBreaker) {
      const desc = (c.description ?? "").toLowerCase();
      const combined =
        `${cCategory} ${cServices.join(" ")} ${desc}`.toLowerCase();
      if (combined.includes(userDealBreaker)) {
        breakdown.dealBreakerPenalty = -40;
      }
    }

    // 7. Industry overlap bonus (0-5)
    const industryOverlapCount = userIndustries.filter((i) =>
      cIndustries.some((ci) => fuzzyMatch(ci, i))
    ).length;
    breakdown.industryOverlap = Math.min(industryOverlapCount * 2, 5);

    // 8. Data richness bonus (0-5)
    breakdown.dataRichness = Math.min(
      cServices.length + cSkills.length + cIndustries.length,
      5
    );

    // 9. Preference completeness (0-10)
    if (cCapGaps.length > 0 || cPrefTypes.length > 0) {
      breakdown.preferenceCompleteness = 10;
    }

    // Total (normalized 0-100)
    const raw =
      breakdown.capabilityGapMatch +
      breakdown.reverseMatch +
      breakdown.firmTypePreference +
      breakdown.geographyOverlap +
      breakdown.symbioticBonus +
      breakdown.dealBreakerPenalty +
      breakdown.industryOverlap +
      breakdown.dataRichness +
      breakdown.preferenceCompleteness;
    breakdown.total = Math.max(0, Math.min(100, Math.round(raw)));

    return {
      firm: c,
      score: breakdown.total,
      scoreBreakdown: breakdown,
      symbioticType,
      reverseGaps: reverseGaps.map((g) => g),
      cServices,
      cIndustries,
      cSkills,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ─── AI Explanations ────────────────────────────────────────

export interface GenerateMatchExplanationsOpts {
  sourceFirm: {
    name: string;
    type: string;
    services: string[];
    skills: string[];
    industries: string[];
    gaps: string[];
    partnershipPhilosophy?: string;
    geographyPreference?: string;
    dealBreaker?: string;
  };
  scoredMatches: ScoredMatch[];
}

/**
 * Generate AI explanations, talking points, and bidirectional fit scores
 * for a list of scored matches. Falls back gracefully if AI fails.
 */
export async function generateMatchExplanations(
  opts: GenerateMatchExplanationsOpts
): Promise<PartnerMatch[]> {
  const { sourceFirm, scoredMatches } = opts;

  if (scoredMatches.length === 0) return [];

  const candidateSummaries = scoredMatches
    .map(
      (m, i) =>
        `[${i}] ${m.firm.name} (${m.firm.firmType ?? "Unknown type"})
Services: ${m.cServices.join(", ") || "N/A"}
Skills: ${m.cSkills.join(", ") || "N/A"}
Industries: ${m.cIndustries.join(", ") || "N/A"}
Pre-score: ${m.score}
${m.symbioticType ? `Symbiotic: ${m.symbioticType}` : ""}
Their gaps: ${asArr(m.firm.prefs.capabilityGaps).join(", ") || "N/A"}`
    )
    .join("\n\n");

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  try {
    const aiStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `You are Ossy, an AI partnership consultant for Collective OS.

## YOUR FIRM
Name: ${sourceFirm.name}
Type: ${sourceFirm.type}
Services: ${sourceFirm.services.join(", ")}
Skills: ${sourceFirm.skills.join(", ")}
Industries: ${sourceFirm.industries.join(", ")}
Capability Gaps: ${sourceFirm.gaps.join(", ")}
Partnership Philosophy: ${sourceFirm.partnershipPhilosophy ?? "Not specified"}
Geography Preference: ${sourceFirm.geographyPreference || "Global"}
Deal Breaker: ${sourceFirm.dealBreaker || "None"}

## CANDIDATE PARTNERS
${candidateSummaries}

## INSTRUCTIONS
For each candidate, generate:
1. A concise explanation (2-3 sentences) of why this partnership could work — consider BOTH directions
2. Three specific talking points for a first conversation
3. A bidirectional fit score (0-1 for each direction)

Be specific and actionable. Reference actual services, skills, and industries. Do not be generic.`,
      schema: z.object({
        matches: z.array(
          z.object({
            index: z.number(),
            explanation: z.string(),
            talkingPoints: z.array(z.string()).length(3),
            theyWantUs: z.number(),
            weWantThem: z.number(),
          })
        ),
      }),
      maxOutputTokens: 3000,
    });

    const aiDuration = Date.now() - aiStart;
    await logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "partner-matching" as never,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: aiDuration,
    });

    // Merge AI results with scored matches
    return scoredMatches.map((m, i) => {
      const aiMatch = result.object.matches.find((am) => am.index === i);
      const finalScore = aiMatch
        ? Math.round(
            m.score * 0.6 +
              ((aiMatch.theyWantUs + aiMatch.weWantThem) / 2) * 40
          )
        : m.score;

      return {
        firmId: m.firm.id,
        firmName: m.firm.name,
        website: m.firm.website,
        description: m.firm.description,
        firmType: m.firm.firmType,
        services: m.cServices,
        industries: m.cIndustries,
        skills: m.cSkills,
        matchScore: Math.min(99, Math.max(1, finalScore)),
        scoreBreakdown: m.scoreBreakdown,
        explanation:
          aiMatch?.explanation ??
          "Potential partnership match based on complementary capabilities.",
        symbioticType: m.symbioticType,
        theirGapsThatYouFill: m.reverseGaps,
        talkingPoints: aiMatch?.talkingPoints ?? [
          "Discuss shared client types and referral opportunities",
          "Explore how your services complement each other",
          "Identify a pilot project to test the partnership",
        ],
        bidirectionalFit: {
          theyWantUs: aiMatch?.theyWantUs ?? 0.5,
          weWantThem: aiMatch?.weWantThem ?? 0.5,
        },
      };
    });
  } catch (err) {
    console.error("[PartnerScoring] AI generation failed:", err);

    // Return matches without AI explanations as fallback
    return scoredMatches.map((m) => ({
      firmId: m.firm.id,
      firmName: m.firm.name,
      website: m.firm.website,
      description: m.firm.description,
      firmType: m.firm.firmType,
      services: m.cServices,
      industries: m.cIndustries,
      skills: m.cSkills,
      matchScore: Math.min(99, Math.max(1, m.score)),
      scoreBreakdown: m.scoreBreakdown,
      explanation:
        "Potential partnership match based on complementary capabilities.",
      symbioticType: m.symbioticType,
      theirGapsThatYouFill: m.reverseGaps,
      talkingPoints: [
        "Discuss shared client types and referral opportunities",
        "Explore how your services complement each other",
        "Identify a pilot project to test the partnership",
      ],
      bidirectionalFit: { theyWantUs: 0.5, weWantThem: 0.5 },
    }));
  }
}
