/**
 * Partner Scoring Module
 *
 * Reusable scoring logic for partner matching, extracted from
 * /api/partner-matching/route.ts so it can be shared by the
 * admin simulator and any future matching surfaces.
 *
 * Scoring dimensions (max ~115 raw, normalized to 0-100):
 * 1. Capability gap match (0-30) — enhanced with Neo4j evidence weighting
 * 2. Reverse match (0-20) — enhanced with expert skills from graph
 * 3. Firm type preference (0-20: 15 forward + 5 reverse)
 * 4. Geography overlap (0-10) — uses graph OPERATES_IN when available
 * 5. Symbiotic relationship bonus (0-10)
 * 6. Deal breaker penalty (0 or -40)
 * 7. Industry overlap (0-5) — uses graph SERVES_INDUSTRY when available
 * 8. Data richness (0-5) — uses graph node counts for richer signal
 * 9. Preference completeness (0-10) — checks PREFERS edges
 * 10. Evidence depth bonus (0-5) — case study count from graph
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { logUsage } from "@/lib/ai/gateway";
import { neo4jRead } from "@/lib/neo4j";
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
  evidenceDepth: number; // 0-5 (case study count from graph)
  total: number; // 0-100 normalized
}

// ─── Neo4j Graph Signal Types ──────────────────────────────

export interface GraphSkillSignal {
  name: string;
  csCount: number;
  expCount: number;
  conf: number;
}

export interface GraphServiceSignal {
  name: string;
  csCount: number;
  expCount: number;
}

export interface GraphSignals {
  skills: GraphSkillSignal[];
  services: GraphServiceSignal[];
  caseStudyCount: number;
  industries: string[];
  markets: string[];
  categories: string[];
  expertCount: number;
  expertSkills: string[];
}

export interface GraphPrefEdge {
  dim: string;
  target: string;
  weight: number;
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

// ─── Neo4j Batch Fetch ──────────────────────────────────────

/** Safely convert Neo4j integer (which may be {low, high} object) to number */
function toInt(val: unknown): number {
  if (typeof val === "number") return val;
  if (val && typeof val === "object" && "low" in val) return (val as { low: number }).low ?? 0;
  return Number(val) || 0;
}

/**
 * Batch-fetch graph signals for all candidate firms in ONE Neo4j round-trip.
 * Returns a Map<firmId, GraphSignals>. Gracefully returns empty map on failure.
 */
export async function batchFetchGraphSignals(
  firmIds: string[]
): Promise<Map<string, GraphSignals>> {
  if (firmIds.length === 0) return new Map();

  try {
    const rows = await neo4jRead<{
      firmId: string;
      skills: Array<{ name: string; csCount: unknown; expCount: unknown; conf: unknown }>;
      services: Array<{ name: string; csCount: unknown; expCount: unknown }>;
      caseStudyCount: unknown;
      industries: string[];
      markets: string[];
      categories: string[];
      expertCount: unknown;
      expertSkills: string[];
    }>(
      `UNWIND $firmIds AS fid
       MATCH (f:Company:ServiceFirm {id: fid})
       OPTIONAL MATCH (f)-[hs:HAS_SKILL]->(s:Skill)
       WITH f, collect(DISTINCT {
         name: s.name, csCount: coalesce(hs.caseStudyCount, 0),
         expCount: coalesce(hs.expertCount, 0), conf: coalesce(hs.confidence, 0)
       }) AS skills
       OPTIONAL MATCH (f)-[os:OFFERS_SERVICE]->(svc:Service)
       WITH f, skills, collect(DISTINCT {
         name: svc.name, csCount: coalesce(os.caseStudyCount, 0),
         expCount: coalesce(os.expertCount, 0)
       }) AS services
       OPTIONAL MATCH (f)-[:HAS_CASE_STUDY]->(cs:CaseStudy)
       WITH f, skills, services, count(DISTINCT cs) AS caseStudyCount
       OPTIONAL MATCH (f)-[:SERVES_INDUSTRY]->(i:Industry)
       WITH f, skills, services, caseStudyCount, collect(DISTINCT i.name) AS industries
       OPTIONAL MATCH (f)-[:OPERATES_IN]->(m:Market)
       WITH f, skills, services, caseStudyCount, industries, collect(DISTINCT m.name) AS markets
       OPTIONAL MATCH (f)-[:IN_CATEGORY]->(cat:FirmCategory)
       WITH f, skills, services, caseStudyCount, industries, markets, collect(DISTINCT cat.name) AS categories
       OPTIONAL MATCH (f)<-[:CURRENTLY_AT]-(p:Person)-[:HAS_SKILL|HAS_EXPERTISE]->(es:Skill)
       WITH f, skills, services, caseStudyCount, industries, markets, categories,
         count(DISTINCT p) AS expertCount, collect(DISTINCT es.name) AS expertSkills
       RETURN f.id AS firmId, skills, services, caseStudyCount, industries, markets, categories, expertCount, expertSkills`,
      { firmIds }
    );

    const map = new Map<string, GraphSignals>();
    for (const row of rows) {
      // Filter out null-name skills/services from OPTIONAL MATCH producing {name: null}
      const skills = (row.skills ?? [])
        .filter((s) => s.name != null)
        .map((s) => ({ name: s.name, csCount: toInt(s.csCount), expCount: toInt(s.expCount), conf: toInt(s.conf) / (toInt(s.conf) > 1 ? 100 : 1) }));
      const services = (row.services ?? [])
        .filter((s) => s.name != null)
        .map((s) => ({ name: s.name, csCount: toInt(s.csCount), expCount: toInt(s.expCount) }));

      map.set(row.firmId, {
        skills,
        services,
        caseStudyCount: toInt(row.caseStudyCount),
        industries: (row.industries ?? []).filter(Boolean),
        markets: (row.markets ?? []).filter(Boolean),
        categories: (row.categories ?? []).filter(Boolean),
        expertCount: toInt(row.expertCount),
        expertSkills: (row.expertSkills ?? []).filter(Boolean),
      });
    }
    return map;
  } catch (err) {
    console.error("[PartnerScoring] Neo4j batch fetch failed, scoring with PG only:", err);
    return new Map();
  }
}

/**
 * Batch-fetch PREFERS edges for candidate firms.
 */
export async function batchFetchPrefEdges(
  firmIds: string[]
): Promise<Map<string, GraphPrefEdge[]>> {
  if (firmIds.length === 0) return new Map();

  try {
    const rows = await neo4jRead<{
      firmId: string;
      dim: string;
      target: string;
      weight: unknown;
    }>(
      `UNWIND $firmIds AS fid
       MATCH (f:Company {id: fid})-[p:PREFERS]->(t)
       RETURN f.id AS firmId, p.dimension AS dim, t.name AS target, coalesce(p.weight, 1.0) AS weight`,
      { firmIds }
    );

    const map = new Map<string, GraphPrefEdge[]>();
    for (const row of rows) {
      const existing = map.get(row.firmId) ?? [];
      existing.push({ dim: row.dim, target: row.target, weight: toInt(row.weight) });
      map.set(row.firmId, existing);
    }
    return map;
  } catch {
    return new Map();
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
  /** Pre-fetched Neo4j graph signals per firm. Optional — scoring falls back to PG-only if absent. */
  graphData?: Map<string, GraphSignals>;
  /** Pre-fetched PREFERS edges per firm. Optional. */
  graphPrefs?: Map<string, GraphPrefEdge[]>;
}

/**
 * Score candidate firms against a source firm and its preferences.
 * When graphData is provided, uses Neo4j evidence (case study counts,
 * expert attestation, PREFERS edges) for higher-quality scoring.
 * Returns ScoredMatch[] sorted by score descending.
 */
export function scorePartnerMatches(
  opts: ScorePartnerMatchesOpts
): ScoredMatch[] {
  const { sourceFirm, preferences, candidates, graphData, graphPrefs } = opts;
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

    // Graph signals for this candidate (may be undefined if Neo4j fetch failed/skipped)
    const g = graphData?.get(c.id);
    const gPrefs = graphPrefs?.get(c.id);

    // Merge PG and graph data — prefer graph when available, fall back to PG
    const cServices = g?.services?.length ? [...new Set([...cData.services, ...g.services.map((s) => s.name)])] : cData.services;
    const cSkills = g?.skills?.length ? [...new Set([...cData.skills, ...g.skills.map((s) => s.name)])] : cData.skills;
    const cIndustries = g?.industries?.length ? [...new Set([...cData.industries, ...g.industries])] : cData.industries;
    const cMarkets = g?.markets?.length ? [...new Set([...cData.markets, ...g.markets])] : cData.markets;
    const cCategory = (
      (g?.categories?.[0] ?? cData.categories[0] ?? String(c.firmType ?? ""))
    ).toLowerCase();
    const cCapGaps = asArr(c.prefs.capabilityGaps);
    const cPrefTypes = asArr(c.prefs.preferredPartnerTypes);
    // Expert skills from graph (skills attested by actual team members)
    const cExpertSkills = g?.expertSkills ?? [];

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
      evidenceDepth: 0,
      total: 0,
    };

    // 1. Capability gap match: their services/skills fill your gaps (0-30)
    //    Enhanced: apply evidence multiplier from graph when available
    let gapFillScore = 0;
    if (userCapGaps.length > 0) {
      for (const gap of userCapGaps) {
        const serviceMatch = cServices.some((s) => fuzzyMatch(s, gap));
        const skillMatch = cSkills.some((s) => fuzzyMatch(s, gap));
        if (serviceMatch || skillMatch) {
          // Base: 1 point per filled gap
          let gapScore = 1;
          // Evidence multiplier from graph: skill backed by case studies/experts scores higher
          if (g) {
            const graphSkill = g.skills.find((s) => fuzzyMatch(s.name, gap));
            const graphSvc = g.services.find((s) => fuzzyMatch(s.name, gap));
            const totalEvidence = (graphSkill?.csCount ?? 0) + (graphSkill?.expCount ?? 0)
              + (graphSvc?.csCount ?? 0) + (graphSvc?.expCount ?? 0);
            if (totalEvidence >= 3) gapScore = 1.5;
            else if (totalEvidence >= 1) gapScore = 1.2;
          }
          gapFillScore += gapScore;
        }
      }
      // Scale: max possible is userCapGaps.length * 1.5, normalize to 30
      const maxGapScore = userCapGaps.length * 1.5;
      breakdown.capabilityGapMatch = Math.round((gapFillScore / maxGapScore) * 30 * 10) / 10;
    } else {
      breakdown.capabilityGapMatch = 10;
    }

    // 2. Reverse match: your services fill their gaps (0-20)
    //    Enhanced: also check expert skills from graph
    const reverseGaps = cCapGaps.filter(
      (gap) =>
        userServices.some((s) => fuzzyMatch(s, gap)) ||
        userSkills.some((s) => fuzzyMatch(s, gap)) ||
        cExpertSkills.some((s) => fuzzyMatch(s, gap)) // experts who can deliver
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

    // 4. Geography overlap (0-10) — uses graph markets when available
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

    // 7. Industry overlap bonus (0-5) — uses merged PG+graph industries
    const industryOverlapCount = userIndustries.filter((i) =>
      cIndustries.some((ci) => fuzzyMatch(ci, i))
    ).length;
    breakdown.industryOverlap = Math.min(industryOverlapCount * 2, 5);

    // 8. Data richness bonus (0-5)
    //    Enhanced: when graph data available, use richer node counts
    if (g) {
      const richness = g.skills.length + g.services.length + g.caseStudyCount + g.expertCount;
      breakdown.dataRichness = Math.min(Math.round(richness / 2), 5);
    } else {
      breakdown.dataRichness = Math.min(
        cServices.length + cSkills.length + cIndustries.length,
        5
      );
    }

    // 9. Preference completeness (0-10)
    //    Enhanced: also check PREFERS edges from graph
    if (cCapGaps.length > 0 || cPrefTypes.length > 0) {
      breakdown.preferenceCompleteness = 10;
    } else if (gPrefs && gPrefs.length > 0) {
      // Firm has PREFERS edges in graph even if PG prefs are empty
      breakdown.preferenceCompleteness = 7;
    }

    // 10. Evidence depth bonus (0-5) — NEW: case studies are proof of delivery
    if (g && g.caseStudyCount > 0) {
      breakdown.evidenceDepth = Math.min(g.caseStudyCount, 5);
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
      breakdown.preferenceCompleteness +
      breakdown.evidenceDepth;
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
