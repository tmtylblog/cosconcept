/**
 * Admin Partner Matching Evidence Trace API
 *
 * POST /api/admin/partner-matching/evidence
 * Returns deep evidence trace for a source firm → candidate firm pair,
 * showing which Neo4j nodes and edges contributed to each scoring dimension.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, partnerPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEvidenceTrace } from "@/lib/matching/evidence-trace";
import type { FirmWithPrefs } from "@/lib/matching/partner-scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

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
  const { sourceFirmId, candidateFirmId, preferences: prefOverrides } = body as {
    sourceFirmId: string;
    candidateFirmId: string;
    preferences?: Record<string, unknown>;
  };

  if (!sourceFirmId || !candidateFirmId) {
    return NextResponse.json(
      { error: "sourceFirmId and candidateFirmId are required" },
      { status: 400 }
    );
  }

  // Load both firms
  const [sourceFirmRows, candidateFirmRows] = await Promise.all([
    db.select().from(serviceFirms).where(eq(serviceFirms.id, sourceFirmId)).limit(1),
    db.select().from(serviceFirms).where(eq(serviceFirms.id, candidateFirmId)).limit(1),
  ]);

  const sourceFirm = sourceFirmRows[0];
  const candidateFirm = candidateFirmRows[0];

  if (!sourceFirm) {
    return NextResponse.json({ error: "Source firm not found" }, { status: 404 });
  }
  if (!candidateFirm) {
    return NextResponse.json({ error: "Candidate firm not found" }, { status: 404 });
  }

  // Load preferences for both firms
  const [sourcePrefRows, candidatePrefRows] = await Promise.all([
    db.select().from(partnerPreferences).where(eq(partnerPreferences.firmId, sourceFirmId)).limit(1),
    db.select().from(partnerPreferences).where(eq(partnerPreferences.firmId, candidateFirmId)).limit(1),
  ]);

  const actualPrefs = (sourcePrefRows[0]?.rawOnboardingData as Record<string, unknown>) ?? {};
  const preferences: Record<string, unknown> = {
    ...actualPrefs,
    ...(prefOverrides ?? {}),
  };

  const candidate: FirmWithPrefs = {
    id: candidateFirm.id,
    name: candidateFirm.name,
    website: candidateFirm.website,
    description: candidateFirm.description,
    firmType: candidateFirm.firmType,
    enrichmentData: candidateFirm.enrichmentData as Record<string, unknown> | null,
    prefs: (candidatePrefRows[0]?.rawOnboardingData as Record<string, unknown>) ?? {},
  };

  const evidence = await getEvidenceTrace(
    {
      id: sourceFirm.id,
      name: sourceFirm.name,
      firmType: sourceFirm.firmType,
      enrichmentData: (sourceFirm.enrichmentData as Record<string, unknown>) ?? {},
    },
    candidate,
    preferences
  );

  return NextResponse.json(evidence);
}
