/**
 * Partner Matching API
 *
 * GET /api/partner-matching — Returns AI-scored partner matches for the current user's firm.
 *
 * Uses the shared scoring engine from partner-scoring.ts with Neo4j graph enhancement.
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

  // Load candidate firms (COS customers)
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
  const allPrefRows = await db
    .select({
      firmId: partnerPreferences.firmId,
      rawOnboardingData: partnerPreferences.rawOnboardingData,
    })
    .from(partnerPreferences);

  const candidateIdSet = new Set(candidateFirms.map((f) => f.id));
  const prefsMap = new Map<string, Record<string, unknown>>();
  for (const row of allPrefRows) {
    if (candidateIdSet.has(row.firmId)) {
      prefsMap.set(row.firmId, (row.rawOnboardingData as Record<string, unknown>) ?? {});
    }
  }

  const candidates: FirmWithPrefs[] = candidateFirms.map((f) => ({
    ...f,
    enrichmentData: f.enrichmentData as Record<string, unknown> | null,
    prefs: prefsMap.get(f.id) ?? {},
  }));

  // Batch-fetch Neo4j graph signals, hierarchy expansion, and shared clients in parallel
  const candidateIds = candidates.map((c) => c.id);
  const userCapGaps = asArr(userPrefs.capabilityGaps);
  const [graphData, graphPrefs, hierarchyExpansion, sharedClients] = await Promise.all([
    batchFetchGraphSignals(candidateIds),
    batchFetchPrefEdges(candidateIds),
    expandGapHierarchy(userCapGaps),
    batchFetchSharedClients(userFirm.id, candidateIds),
  ]);

  // Score with graph-enhanced signals
  const userEnrichment = (userFirm.enrichmentData as Record<string, unknown>) ?? {};
  const scored = scorePartnerMatches({
    sourceFirm: {
      id: userFirm.id,
      name: userFirm.name,
      firmType: userFirm.firmType,
      enrichmentData: userEnrichment,
    },
    preferences: userPrefs,
    candidates,
    graphData,
    graphPrefs,
    hierarchyExpansion,
    sharedClients,
  });

  // Take top 15
  const topMatches = scored.slice(0, 15).filter((m) => m.score > 10);

  if (topMatches.length === 0) {
    return NextResponse.json({
      preferencesComplete: true,
      matches: [],
      firmId: userFirm.id,
      message: "No strong matches found. Try broadening your preferences.",
    });
  }

  // Generate AI explanations
  const sourceData = getFirmData(userEnrichment);
  const sourceCategory = (sourceData.categories[0] ?? String(userFirm.firmType ?? "")).toLowerCase();
  const matches = await generateMatchExplanations({
    sourceFirm: {
      name: userFirm.name,
      type: sourceCategory,
      services: sourceData.services,
      skills: sourceData.skills,
      industries: sourceData.industries,
      gaps: asArr(userPrefs.capabilityGaps),
      partnershipPhilosophy: userPrefs.partnershipPhilosophy as string | undefined,
      geographyPreference: userPrefs.geographyPreference as string | undefined,
      dealBreaker: userPrefs.dealBreaker as string | undefined,
    },
    scoredMatches: topMatches,
  });

  matches.sort((a, b) => b.matchScore - a.matchScore);

  return NextResponse.json({
    preferencesComplete: true,
    matches,
    firmId: userFirm.id,
  });
}
