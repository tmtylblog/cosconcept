/**
 * Admin Partner Matching Simulator API
 *
 * POST /api/admin/partner-matching/simulate
 * Runs the partner matching scoring engine for any firm with optional preference overrides.
 * Admin-only. Does NOT create partnerships or send emails.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, partnerPreferences } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import {
  scorePartnerMatches,
  generateMatchExplanations,
  batchFetchGraphSignals,
  batchFetchPrefEdges,
  expandGapHierarchy,
  batchFetchSharedClients,
  getFirmData,
  asArr,
  type FirmWithPrefs,
} from "@/lib/matching/partner-scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "superadmin" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { sourceFirmId, overridePreferences, skipAI } = body as {
    sourceFirmId: string;
    overridePreferences?: Record<string, unknown>;
    skipAI?: boolean;
  };

  if (!sourceFirmId) {
    return NextResponse.json({ error: "sourceFirmId is required" }, { status: 400 });
  }

  const start = Date.now();

  // Load source firm
  const [sourceFirm] = await db
    .select()
    .from(serviceFirms)
    .where(eq(serviceFirms.id, sourceFirmId))
    .limit(1);

  if (!sourceFirm) {
    return NextResponse.json({ error: "Source firm not found" }, { status: 404 });
  }

  // Load source firm preferences
  const [prefRow] = await db
    .select()
    .from(partnerPreferences)
    .where(eq(partnerPreferences.firmId, sourceFirmId))
    .limit(1);

  const actualPrefs = (prefRow?.rawOnboardingData as Record<string, unknown>) ?? {};

  // Merge with overrides
  const preferences: Record<string, unknown> = {
    ...actualPrefs,
    ...(overridePreferences ?? {}),
  };

  // Load all candidate firms
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
        ne(serviceFirms.id, sourceFirmId)
      )
    );

  // Load all preferences
  const allPrefRows = await db
    .select({
      firmId: partnerPreferences.firmId,
      rawOnboardingData: partnerPreferences.rawOnboardingData,
    })
    .from(partnerPreferences);

  const prefsMap = new Map<string, Record<string, unknown>>();
  for (const row of allPrefRows) {
    prefsMap.set(row.firmId, (row.rawOnboardingData as Record<string, unknown>) ?? {});
  }

  const candidates: FirmWithPrefs[] = allFirms.map((f) => ({
    ...f,
    enrichmentData: f.enrichmentData as Record<string, unknown> | null,
    prefs: prefsMap.get(f.id) ?? {},
  }));

  // Batch-fetch Neo4j graph signals, hierarchy expansion, and shared clients in parallel
  const candidateIds = candidates.map((c) => c.id);
  const capGaps = asArr(preferences.capabilityGaps);
  const [graphData, graphPrefs, hierarchyExpansion, sharedClients] = await Promise.all([
    batchFetchGraphSignals(candidateIds),
    batchFetchPrefEdges(candidateIds),
    expandGapHierarchy(capGaps),
    batchFetchSharedClients(sourceFirmId, candidateIds),
  ]);

  // Score with graph-enhanced signals
  const scored = scorePartnerMatches({
    sourceFirm: {
      id: sourceFirm.id,
      name: sourceFirm.name,
      firmType: sourceFirm.firmType,
      enrichmentData: (sourceFirm.enrichmentData as Record<string, unknown>) ?? {},
    },
    preferences,
    candidates,
    graphData,
    graphPrefs,
    hierarchyExpansion,
    sharedClients,
  });

  // Take top 15 (already sorted by scorePartnerMatches)
  const topMatches = scored.slice(0, 15).filter((m) => m.score > 10);

  // Get source firm data for response
  const sourceEnrichment = (sourceFirm.enrichmentData as Record<string, unknown>) ?? {};
  const sourceData = getFirmData(sourceEnrichment);

  let matches;

  if (skipAI || topMatches.length === 0) {
    // Return without AI explanations
    matches = topMatches.map((m) => ({
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
      explanation: "AI explanation skipped.",
      symbioticType: m.symbioticType,
      theirGapsThatYouFill: m.reverseGaps,
      talkingPoints: [] as string[],
      bidirectionalFit: { theyWantUs: 0.5, weWantThem: 0.5 },
    }));
  } else {
    // Generate AI explanations
    const sourceCategory = (sourceData.categories[0] ?? String(sourceFirm.firmType ?? "")).toLowerCase();
    matches = await generateMatchExplanations({
      sourceFirm: {
        name: sourceFirm.name,
        type: sourceCategory,
        services: sourceData.services,
        skills: sourceData.skills,
        industries: sourceData.industries,
        gaps: asArr(preferences.capabilityGaps),
        partnershipPhilosophy: preferences.partnershipPhilosophy as string | undefined,
        geographyPreference: preferences.geographyPreference as string | undefined,
        dealBreaker: preferences.dealBreaker as string | undefined,
      },
      scoredMatches: topMatches,
    });
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);

  return NextResponse.json({
    sourceFirm: {
      id: sourceFirm.id,
      name: sourceFirm.name,
      firmType: sourceFirm.firmType,
      services: sourceData.services,
      skills: sourceData.skills,
      industries: sourceData.industries,
    },
    preferencesUsed: preferences,
    matches,
    stats: {
      candidatesScored: candidates.length,
      matchesReturned: matches.length,
      durationMs: Date.now() - start,
    },
  });
}
