/**
 * Partner Matching API
 *
 * GET /api/partner-matching — Returns AI-scored partner matches for the current user's firm.
 *
 * Scoring dimensions:
 * 1. Capability gap match (their services fill your gaps)
 * 2. Reverse match (your services fill their gaps)
 * 3. Firm type preference alignment
 * 4. Geography overlap
 * 5. Symbiotic relationship patterns (firm-relationships.csv)
 * 6. Deal breaker elimination
 *
 * Top matches get AI-generated explanations via Gemini Flash.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  serviceFirms,
  partnerPreferences,
  partnerships,
  members,
} from "@/lib/db/schema";
import { eq, or, and, ne } from "drizzle-orm";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { logUsage } from "@/lib/ai/gateway";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Symbiotic relationships cache ──────────────────────────

let _relCache: { typeA: string; typeB: string; nature: string }[] | null = null;

function getSymbioticRelationships() {
  if (_relCache) return _relCache;
  try {
    const csv = readFileSync(
      join(process.cwd(), "data/firm-relationships.csv"),
      "utf-8"
    );
    const lines = csv.split("\n").slice(1).filter(Boolean);
    _relCache = lines.map((line) => {
      const cols = parseCsvLine(line);
      return { typeA: cols[0] ?? "", typeB: cols[1] ?? "", nature: cols[2] ?? "" };
    }).filter((r) => r.typeA && r.typeB);
    return _relCache;
  } catch {
    _relCache = [];
    return _relCache;
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

// ─── Types ──────────────────────────────────────────────────

interface FirmWithPrefs {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  firmType: string | null;
  enrichmentData: Record<string, unknown> | null;
  prefs: Record<string, unknown>;
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
  explanation: string;
  symbioticType: string | null;
  theirGapsThatYouFill: string[];
  talkingPoints: string[];
  bidirectionalFit: {
    theyWantUs: number;
    weWantThem: number;
  };
}

// ─── GET handler ──────────────────────────────────────────────

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve user's firm
  const [membership] = await db
    .select({ orgId: members.organizationId })
    .from(members)
    .where(eq(members.userId, session.user.id))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "No organization found" }, { status: 404 });
  }

  const [userFirm] = await db
    .select()
    .from(serviceFirms)
    .where(eq(serviceFirms.organizationId, membership.orgId))
    .limit(1);

  if (!userFirm) {
    return NextResponse.json({ error: "No firm found" }, { status: 404 });
  }

  // Load user's preferences
  const [userPrefRow] = await db
    .select()
    .from(partnerPreferences)
    .where(eq(partnerPreferences.firmId, userFirm.id))
    .limit(1);

  const userPrefs = (userPrefRow?.rawOnboardingData as Record<string, unknown>) ?? {};
  const userEnrichment = (userFirm.enrichmentData as Record<string, unknown>) ?? {};
  const userConfirmed = (userEnrichment.confirmed as Record<string, unknown>) ?? {};

  // Check preference completeness
  const v2Fields = [
    "partnershipPhilosophy",
    "capabilityGaps",
    "preferredPartnerTypes",
    "dealBreaker",
    "geographyPreference",
  ];
  const prefsComplete = v2Fields.every((f) => userPrefs[f] != null);

  if (!prefsComplete) {
    return NextResponse.json({
      preferencesComplete: false,
      matches: [],
      firmId: userFirm.id,
    });
  }

  // Load existing partnerships to exclude
  const existingPartnerships = await db
    .select({ firmAId: partnerships.firmAId, firmBId: partnerships.firmBId })
    .from(partnerships)
    .where(
      and(
        or(
          eq(partnerships.firmAId, userFirm.id),
          eq(partnerships.firmBId, userFirm.id)
        ),
        or(
          eq(partnerships.status, "requested"),
          eq(partnerships.status, "accepted"),
          eq(partnerships.status, "suggested")
        )
      )
    );

  const excludeFirmIds = new Set(
    existingPartnerships.map((p) =>
      p.firmAId === userFirm.id ? p.firmBId : p.firmAId
    )
  );
  excludeFirmIds.add(userFirm.id);

  // Load candidate firms (COS customers with preferences)
  const allFirms = await db
    .select({
      id: serviceFirms.id,
      name: serviceFirms.name,
      website: serviceFirms.website,
      description: serviceFirms.description,
      firmType: serviceFirms.firmType,
      enrichmentData: serviceFirms.enrichmentData,
    })
    .from(serviceFirms)
    .where(
      and(
        eq(serviceFirms.isCosCustomer, true),
        ne(serviceFirms.id, userFirm.id)
      )
    );

  // Filter out already-partnered firms
  const candidateFirms = allFirms.filter((f) => !excludeFirmIds.has(f.id));

  if (candidateFirms.length === 0) {
    return NextResponse.json({
      preferencesComplete: true,
      matches: [],
      firmId: userFirm.id,
      message: "No candidate firms found for matching.",
    });
  }

  // Load preferences for all candidate firms
  const candidateIds = candidateFirms.map((f) => f.id);
  const allPrefRows = await db
    .select({
      firmId: partnerPreferences.firmId,
      rawOnboardingData: partnerPreferences.rawOnboardingData,
    })
    .from(partnerPreferences);

  const prefsMap = new Map<string, Record<string, unknown>>();
  for (const row of allPrefRows) {
    if (candidateIds.includes(row.firmId)) {
      prefsMap.set(
        row.firmId,
        (row.rawOnboardingData as Record<string, unknown>) ?? {}
      );
    }
  }

  // Build enriched candidate list
  const candidates: FirmWithPrefs[] = candidateFirms.map((f) => ({
    ...f,
    enrichmentData: f.enrichmentData as Record<string, unknown> | null,
    prefs: prefsMap.get(f.id) ?? {},
  }));

  // ─── Scoring ────────────────────────────────────────────────

  const relationships = getSymbioticRelationships();

  // Helper: read firm data from confirmed first, then fall back to enrichment classification/extracted
  function getFirmData(enrichment: Record<string, unknown>) {
    const confirmed = (enrichment.confirmed as Record<string, unknown>) ?? {};
    const classification = (enrichment.classification as Record<string, unknown>) ?? {};
    const extracted = (enrichment.extracted as Record<string, unknown>) ?? {};
    return {
      services: asArr(confirmed.services).length > 0 ? asArr(confirmed.services) : asArr(extracted.services),
      skills: asArr(confirmed.skills).length > 0 ? asArr(confirmed.skills) : asArr(classification.skills),
      industries: asArr(confirmed.industries).length > 0 ? asArr(confirmed.industries) : asArr(classification.industries),
      markets: asArr(confirmed.markets).length > 0 ? asArr(confirmed.markets) : asArr(classification.markets),
      categories: asArr(confirmed.firmCategory ? [confirmed.firmCategory] : []).length > 0
        ? asArr([confirmed.firmCategory])
        : asArr(classification.categories),
    };
  }

  const userData = getFirmData(userEnrichment);
  const userServices = userData.services;
  const userSkills = userData.skills;
  const userIndustries = userData.industries;
  const userCapGaps = asArr(userPrefs.capabilityGaps);
  const userPrefTypes = asArr(userPrefs.preferredPartnerTypes);
  const userGeo = String(userPrefs.geographyPreference ?? "").toLowerCase();
  const userDealBreaker = String(userPrefs.dealBreaker ?? "").toLowerCase();
  const userCategory = (userData.categories[0] ?? String(userFirm.firmType ?? "")).toLowerCase();

  const scored = candidates.map((c) => {
    const cEnrichment = c.enrichmentData ?? {};
    const cData = getFirmData(cEnrichment);
    const cServices = cData.services;
    const cSkills = cData.skills;
    const cIndustries = cData.industries;
    const cMarkets = cData.markets;
    const cCategory = (cData.categories[0] ?? String(c.firmType ?? "")).toLowerCase();
    const cCapGaps = asArr(c.prefs.capabilityGaps);
    const cPrefTypes = asArr(c.prefs.preferredPartnerTypes);

    let score = 0;

    // 1. Capability gap match: their services/skills fill your gaps (0-30)
    const gapFillCount = userCapGaps.filter((gap) =>
      cServices.some((s) => fuzzyMatch(s, gap)) ||
      cSkills.some((s) => fuzzyMatch(s, gap))
    ).length;
    score += userCapGaps.length > 0 ? (gapFillCount / userCapGaps.length) * 30 : 10;

    // 2. Reverse match: your services fill their gaps (0-20)
    const reverseGaps = cCapGaps.filter((gap) =>
      userServices.some((s) => fuzzyMatch(s, gap)) ||
      userSkills.some((s) => fuzzyMatch(s, gap))
    );
    score += cCapGaps.length > 0 ? (reverseGaps.length / cCapGaps.length) * 20 : 5;

    // 3. Firm type preference (0-15)
    if (userPrefTypes.length > 0 && cCategory) {
      const typeMatch = userPrefTypes.some((t) => fuzzyMatch(cCategory, t));
      if (typeMatch) score += 15;
    }
    // Reverse: do they want our type?
    if (cPrefTypes.length > 0 && userCategory) {
      const reverseTypeMatch = cPrefTypes.some((t) => fuzzyMatch(userCategory, t));
      if (reverseTypeMatch) score += 5;
    }

    // 4. Geography overlap (0-10)
    if (userGeo && cMarkets.length > 0) {
      const geoMatch = cMarkets.some((m) => fuzzyMatch(m, userGeo));
      if (geoMatch) score += 10;
    } else {
      score += 3; // No preference = slight boost
    }

    // 5. Symbiotic relationship bonus (0-10)
    let symbioticType: string | null = null;
    if (userCategory && cCategory) {
      const rel = relationships.find(
        (r) =>
          (fuzzyMatch(r.typeA, userCategory) && fuzzyMatch(r.typeB, cCategory)) ||
          (fuzzyMatch(r.typeA, cCategory) && fuzzyMatch(r.typeB, userCategory))
      );
      if (rel) {
        score += 10;
        symbioticType = rel.nature;
      }
    }

    // 6. Deal breaker check — penalize heavily
    if (userDealBreaker) {
      const desc = (c.description ?? "").toLowerCase();
      const combined = `${cCategory} ${cServices.join(" ")} ${desc}`.toLowerCase();
      if (combined.includes(userDealBreaker)) {
        score -= 40;
      }
    }

    // Industry overlap bonus (0-5)
    const industryOverlap = userIndustries.filter((i) =>
      cIndustries.some((ci) => fuzzyMatch(ci, i))
    ).length;
    score += Math.min(industryOverlap * 2, 5);

    // Data richness bonus (0-5) — firms with more data are better candidates
    const dataPoints = cServices.length + cSkills.length + cIndustries.length;
    score += Math.min(dataPoints, 5);

    // Preference completeness bonus — heavily weight firms that have set preferences
    if (cCapGaps.length > 0 || cPrefTypes.length > 0) {
      score += 10;
    }

    // Normalize to 0-100
    score = Math.max(0, Math.min(100, score));

    return {
      firm: c,
      score,
      symbioticType,
      reverseGaps: reverseGaps.map((g) => g),
      cServices,
      cIndustries,
      cSkills,
    };
  });

  // Sort by score descending, take top 15
  scored.sort((a, b) => b.score - a.score);
  const topMatches = scored.slice(0, 15).filter((m) => m.score > 10);

  if (topMatches.length === 0) {
    return NextResponse.json({
      preferencesComplete: true,
      matches: [],
      firmId: userFirm.id,
      message: "No strong matches found. Try broadening your preferences.",
    });
  }

  // ─── AI Explanations ───────────────────────────────────────

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const candidateSummaries = topMatches
    .map((m, i) => {
      return `[${i}] ${m.firm.name} (${m.firm.firmType ?? "Unknown type"})
Services: ${m.cServices.join(", ") || "N/A"}
Skills: ${m.cSkills.join(", ") || "N/A"}
Industries: ${m.cIndustries.join(", ") || "N/A"}
Pre-score: ${m.score}
${m.symbioticType ? `Symbiotic: ${m.symbioticType}` : ""}
Their gaps: ${asArr(m.firm.prefs.capabilityGaps).join(", ") || "N/A"}`;
    })
    .join("\n\n");

  try {
    const aiStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `You are Ossy, an AI partnership consultant for Collective OS.

## YOUR FIRM
Name: ${userFirm.name}
Type: ${userCategory}
Services: ${userServices.join(", ")}
Skills: ${userSkills.join(", ")}
Industries: ${userIndustries.join(", ")}
Capability Gaps: ${userCapGaps.join(", ")}
Partnership Philosophy: ${userPrefs.partnershipPhilosophy ?? "Not specified"}
Geography Preference: ${userGeo || "Global"}
Deal Breaker: ${userDealBreaker || "None"}

## CANDIDATE PARTNERS
${candidateSummaries}

## INSTRUCTIONS
For each candidate, generate:
1. A concise explanation (2-3 sentences) of why this partnership could work — consider BOTH directions
2. Three specific talking points for a first conversation
3. A bidirectional fit score (0-1 for each direction)

Be specific and actionable. Reference actual services, skills, and industries. Don&apos;t be generic.`,
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
      feature: "partner-matching",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: aiDuration,
    });

    // Merge AI results with scored matches
    const matches: PartnerMatch[] = topMatches.map((m, i) => {
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
        explanation: aiMatch?.explanation ?? "Potential partnership match based on complementary capabilities.",
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

    // Sort by final score
    matches.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({
      preferencesComplete: true,
      matches,
      firmId: userFirm.id,
    });
  } catch (err) {
    console.error("[PartnerMatching] AI generation failed:", err);

    // Return matches without AI explanations as fallback
    const matches: PartnerMatch[] = topMatches.map((m) => ({
      firmId: m.firm.id,
      firmName: m.firm.name,
      website: m.firm.website,
      description: m.firm.description,
      firmType: m.firm.firmType,
      services: m.cServices,
      industries: m.cIndustries,
      skills: m.cSkills,
      matchScore: Math.min(99, Math.max(1, m.score)),
      explanation: "Potential partnership match based on complementary capabilities.",
      symbioticType: m.symbioticType,
      theirGapsThatYouFill: m.reverseGaps,
      talkingPoints: [
        "Discuss shared client types and referral opportunities",
        "Explore how your services complement each other",
        "Identify a pilot project to test the partnership",
      ],
      bidirectionalFit: { theyWantUs: 0.5, weWantThem: 0.5 },
    }));

    matches.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({
      preferencesComplete: true,
      matches,
      firmId: userFirm.id,
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function asArr(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v) => typeof v === "string");
  if (typeof val === "string" && val) return [val];
  return [];
}

/** Case-insensitive substring match in either direction */
function fuzzyMatch(a: string, b: string): boolean {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  return al.includes(bl) || bl.includes(al);
}
